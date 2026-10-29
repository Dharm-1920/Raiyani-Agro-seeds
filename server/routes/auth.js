const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { User, AuthToken } = require('../models');
const { protect } = require('../middleware');
const { normalizeEmail, normalizePhone, validPassword, publicUser: pub, sign } = require('../services/identity');
const tokens = require('../services/account-tokens');
const mail = require('../services/mail');
const dummyHash = bcrypt.hashSync('not-an-account-password', 10);
const limited = (limit, windowMs = 3600000) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many attempts. Please try again later.' } });

router.get('/options', (req, res) => res.json({
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI),
  email: true, phone: true, emailDelivery: mail.configured(),
  whatsappDelivery: require('../services/invoice-delivery').whatsappConfigured(),
}));
router.post('/register', limited(10), async (req, res) => {
  try {
    const { name, password, address = '' } = req.body;
    const email = normalizeEmail(req.body.email), phone = req.body.phone ? normalizePhone(req.body.phone) : null;
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || !email || !validPassword(password) || typeof address !== 'string' || address.length > 1000 || (req.body.phone && !phone))
      return res.status(400).json({ message: 'Enter your name, a valid email, and an 8+ character password (up to 72 bytes). Use a valid phone number with country code.' });
    const user = await User.create({ name: name.trim(), email, password: await bcrypt.hash(password, 10), ...(phone ? { phone, phoneLogin: phone } : {}), address: address.trim(), emailVerified: false, passwordEnabled: true });
    let verificationEmailSent = false;
    if (mail.configured()) {
      try { await tokens.issue(user, 'verify'); verificationEmailSent = true; }
      catch { console.error('Account verification email could not be sent.'); }
    }
    sign(res, user);
    res.status(201).json({ user: pub(user), verificationEmailSent });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 503).json({ message: error.code === 11000 ? 'Email or phone already registered. Sign in or reset your password.' : 'Your account could not be created. Please try again.' });
  }
});
const login = (admin = false) => async (req, res) => {
  try {
    let user;
    if (!admin && req.body.method === 'phone') {
      const phone = normalizePhone(req.body.phone);
      if (phone) {
        user = await User.findOne({ phoneLogin: phone });
        if (!user) {
          const variants = [phone, phone.slice(1), ...(phone.startsWith('+91') ? [phone.slice(3)] : [])];
          const legacy = await User.find({ phone: { $in: variants }, phoneLogin: { $exists: false } }).limit(2);
          if (legacy.length === 1) user = legacy[0];
        }
      }
    } else {
      const email = normalizeEmail(req.body.email);
      if (email) user = await User.findOne({ email });
    }
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const valid = password && Buffer.byteLength(password, 'utf8') <= 72 && await bcrypt.compare(password, user?.passwordEnabled !== false && user?.password ? user.password : dummyHash);
    if (!user || user.passwordEnabled === false || !valid) return res.status(401).json({ message: 'Invalid sign-in details. Check your email or phone and password.' });
    if (admin && user.role !== 'admin') return res.status(403).json({ message: 'This account does not have admin access.' });
    sign(res, user); res.json({ user: pub(user) });
  } catch { res.status(503).json({ message: 'Unable to log in. Please try again.' }); }
};
router.post('/login', limited(20, 15 * 60000), login());
router.post('/admin/login', limited(10, 15 * 60000), login(true));
router.post('/logout', (req, res) => { res.clearCookie('token', { path: '/' }); res.json({ ok: true }); });
router.post('/forgot-password', limited(5), async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (!mail.configured()) return res.status(503).json({ message: 'Email recovery is not connected yet. Please contact the shop.' });
  // Respond without waiting for the provider, so account existence is not exposed by SMTP/API latency.
  try { const user = await User.findOne({ email }); if (user) tokens.issue(user, 'reset').catch(() => console.error('Password recovery email could not be sent.')); }
  catch { console.error('Password recovery email could not be sent.'); }
  res.status(202).json({ message: 'If an account matches this email, a reset link will arrive shortly. Check your spam folder too.' });
});
router.post('/reset-password', limited(10), async (req, res) => {
  if (!validPassword(req.body.password)) return res.status(400).json({ message: 'Use at least 8 characters and no more than 72 bytes for your password.' });
  try {
    const password = await bcrypt.hash(req.body.password, 10), token = await tokens.consume(req.body.token, 'reset');
    if (!token) return res.status(400).json({ message: 'This reset link is invalid or expired. Request a new one.' });
    const user = await User.findOneAndUpdate({ _id: token.user }, { $set: { password, passwordEnabled: true, emailVerified: true }, $inc: { authVersion: 1 } }, { new: true });
    if (!user) return res.status(400).json({ message: 'This reset link is invalid or expired. Request a new one.' });
    await AuthToken.deleteMany({ user: user._id });
    res.clearCookie('token', { path: '/' });
    res.json({ message: 'Your password has been reset. Sign in with your new password.' });
  } catch { res.status(503).json({ message: 'Password could not be reset. Please request another link.' }); }
});
router.post('/verify-email', limited(15), async (req, res) => {
  try {
    const token = await tokens.consume(req.body.token, 'verify');
    if (!token) return res.status(400).json({ message: 'This verification link is invalid or expired. Request a new one from your account.' });
    const user = await User.findOneAndUpdate({ _id: token.user }, { $set: { emailVerified: true } }, { new: true });
    if (!user) return res.status(400).json({ message: 'This verification link is invalid or expired.' });
    res.json({ message: 'Your email is verified. Purchase invoices can now be sent to you.' });
  } catch { res.status(503).json({ message: 'Email could not be verified. Please try again.' }); }
});
router.post('/resend-verification', protect, limited(3), async (req, res) => {
  if (req.user.emailVerified) return res.json({ message: 'Your email is already verified.' });
  if (!mail.configured()) return res.status(503).json({ message: 'Email delivery is not connected yet. Please contact the shop.' });
  try { await tokens.issue(req.user, 'verify'); res.json({ message: 'Verification link sent. Check your email and spam folder.' }); }
  catch { res.status(503).json({ message: 'Verification email could not be sent. Please try later.' }); }
});
router.get('/me', protect, (req, res) => res.json({ user: pub(req.user) }));
router.put('/me', protect, async (req, res) => {
  try {
    if (String(req.body.accountId) !== String(req.user._id)) return res.status(403).json({ message: 'Your account changed. Please reload your profile.' });
    const { name, phone, address } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof phone !== 'string' || phone.length > 30 || typeof address !== 'string' || address.length > 1000) return res.status(400).json({ message: 'Provide a name, phone and address within the allowed lengths.' });
    const normalized = phone.trim() ? normalizePhone(phone) : null;
    if (phone.trim() && !normalized) return res.status(400).json({ message: 'Enter a valid phone number with country code, such as +91 9876543210.' });
    Object.assign(req.user, { name: name.trim(), phone: normalized || '', phoneLogin: normalized || undefined, ...(req.user.deliveryAddresses === undefined ? { address: address.trim() } : {}) });
    await req.user.save(); res.json({ user: pub(req.user) });
  } catch (error) { res.status(error.code === 11000 ? 409 : 503).json({ message: error.code === 11000 ? 'This phone number is already linked to another account.' : 'Profile could not be saved. Please try again.' }); }
});
router.use(require('./google-auth'));
module.exports = router;

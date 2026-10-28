const router = require('express').Router();
const jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs'), crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { User } = require('../models');
const { protect } = require('../middleware');
const { sign, newToken, publicOrigin, normalizeEmail } = require('../services/identity');
const cookieName = 'google_oauth';
const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/auth/google', maxAge: 10 * 60000 });
function client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) throw new Error('Google sign-in is not configured.');
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}
function begin(req, res, linkId) {
  try {
    const oauth = client(), state = newToken(), nonce = newToken(), verifier = newToken();
    const requested = typeof req.query.next === 'string' ? req.query.next : '/';
    const next = /^\/(?:home|shop|cart|checkout|orders|account)?$/.test(requested) ? requested : '/';
    res.cookie(cookieName, jwt.sign({ purpose: 'google-state', state, nonce, verifier, next, ...(linkId ? { linkId: String(linkId), version: req.user.authVersion || 0 } : {}) }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '10m' }), cookieOptions());
    res.redirect(oauth.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, nonce, prompt: 'select_account', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }));
  } catch { res.redirect(new URL('/login?authError=google_unavailable', publicOrigin()).toString()); }
}
router.get('/google/start', (req, res) => begin(req, res));
router.get('/google/link', protect, (req, res) => begin(req, res, req.user._id));
router.get('/google/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(cookieName, clearOptions);
  let link = false;
  try {
    const state = jwt.verify(req.cookies[cookieName], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (state.purpose !== 'google-state' || typeof req.query.state !== 'string' || req.query.state !== state.state || typeof req.query.code !== 'string') throw new Error('Invalid OAuth state.');
    link = Boolean(state.linkId);
    const oauth = client();
    const { tokens } = await oauth.getToken({ code: req.query.code, codeVerifier: state.verifier });
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const google = ticket.getPayload(), email = normalizeEmail(google.email);
    if (!google.sub || !google.email_verified || !email || google.nonce !== state.nonce) throw new Error('Google identity not verified.');
    let user = await User.findOne({ googleId: google.sub });
    if (link) {
      const session = jwt.verify(req.cookies.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
      const owner = await User.findById(state.linkId);
      if (!owner || String(session.id) !== state.linkId || (session.version || 0) !== (owner.authVersion || 0) || state.version !== (owner.authVersion || 0) || email !== owner.email || (user && String(user._id) !== state.linkId)) throw new Error('Account link mismatch.');
      owner.googleId = google.sub; owner.emailVerified = true; await owner.save(); user = owner;
    } else if (!user) {
      // Matching email alone must not attach Google to an existing password account.
      if (await User.findOne({ email })) return res.redirect(new URL('/login?authError=google_link_required', publicOrigin()).toString());
      user = await User.create({ name: String(google.name || email.split('@')[0]).slice(0, 120), email, googleId: google.sub, emailVerified: true, passwordEnabled: false, password: await bcrypt.hash(newToken(), 10) });
    }
    sign(res, user); res.redirect(new URL(link ? '/account?google=connected' : state.next, publicOrigin()).toString());
  } catch { res.redirect(new URL(link ? '/account?google=failed' : '/login?authError=google_failed', publicOrigin()).toString()); }
});
module.exports = router;

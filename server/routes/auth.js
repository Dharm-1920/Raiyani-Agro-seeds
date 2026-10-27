const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { protect } = require('../middleware');
const sign = (res, user) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5 });
  return token;
};
const pub = (u) => ({ id: u._id, name: u.name, email: u.email, phone: u.phone, address: u.address, role: u.role });
router.post('/register', async (req, res) => {
  const { name, email, password, phone, address } = req.body;
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || (password || '').length < 6)
    return res.status(400).json({ message: 'Name, valid email and a password of 6+ characters are required' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
  const user = await User.create({ name, email, phone, address, password: await bcrypt.hash(password, 10) });
  sign(res, user);
  res.status(201).json({ user: pub(user) });
});
const login = (admin = false) => async (req, res) => {
  try {
    const user = await User.findOne({ email: String(req.body.email || '').trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password)))
      return res.status(401).json({ message: 'Invalid email or password' });
    if (admin && user.role !== 'admin') return res.status(403).json({ message: 'This account does not have admin access.' });
    sign(res, user);
    res.json({ user: pub(user) });
  } catch { res.status(500).json({ message: 'Unable to log in. Please try again.' }); }
};
router.post('/login', login());
router.post('/admin/login', login(true));
router.post('/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
router.get('/me', protect, (req, res) => res.json({ user: pub(req.user) }));
router.put('/me', protect, async (req, res) => {
  try {
    if (String(req.body.accountId) !== String(req.user._id)) return res.status(403).json({ message: 'Your account changed. Please reload your profile.' });
    const { name, phone, address } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof phone !== 'string' || phone.length > 30 || typeof address !== 'string' || address.length > 1000) return res.status(400).json({ message: 'Provide a name, phone and address within the allowed lengths.' });
    Object.assign(req.user, { name: name.trim(), phone: phone.trim(), address: address.trim() });
    await req.user.save();
    res.json({ user: pub(req.user) });
  } catch { res.status(500).json({ message: 'Profile could not be saved. Please try again.' }); }
});
module.exports = router;

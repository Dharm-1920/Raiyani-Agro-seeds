const crypto = require('crypto');
const jwt = require('jsonwebtoken');
function normalizePhone(value) {
  if (typeof value !== 'string' || value.length > 40 || /[^\d+\s().-]/.test(value)) return null;
  let phone = value.replace(/[\s().-]/g, '');
  if (/^[6-9]\d{9}$/.test(phone)) phone = '+91' + phone;
  if (/^91[6-9]\d{9}$/.test(phone)) phone = '+' + phone;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}
function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value, 'utf8') <= 72;
}
function publicUser(u) {
  return { id: u._id, name: u.name, email: u.email, phone: u.phone, address: u.address, role: u.role, emailVerified: Boolean(u.emailVerified), googleLinked: Boolean(u.googleId), passwordEnabled: u.passwordEnabled !== false };
}
function sign(res, user) {
  const token = jwt.sign({ id: user._id, version: user.authVersion || 0 }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 7 * 864e5, path: '/' });
}
function publicOrigin() {
  const url = new URL(process.env.APP_URL || process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173');
  if (!['https:', 'http:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) throw new Error('Configure APP_URL with the public HTTPS website address.');
  return url.origin;
}
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url');
module.exports = { normalizePhone, normalizeEmail, validPassword, publicUser, sign, publicOrigin, hashToken, newToken };

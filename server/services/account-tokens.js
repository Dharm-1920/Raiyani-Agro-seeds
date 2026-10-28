const { AuthToken } = require('../models');
const mail = require('./mail');
const { newToken, hashToken, publicOrigin } = require('./identity');
async function issue(user, purpose) {
  const raw = newToken();
  const duration = purpose === 'reset' ? 30 * 60000 : 24 * 60 * 60000;
  const tokenHash = hashToken(raw);
  await AuthToken.findOneAndUpdate({ user: user._id, purpose }, { $set: { tokenHash, expiresAt: new Date(Date.now() + duration) } }, { upsert: true, new: true });
  const url = new URL(purpose === 'reset' ? '/reset-password' : '/verify-email', publicOrigin());
  url.hash = 'token=' + raw;
  try {
    await mail.send({
      to: user.email,
      subject: purpose === 'reset' ? 'Reset your Raiyani Agro Seeds password' : 'Verify your Raiyani Agro Seeds email',
      text: purpose === 'reset'
        ? `Use this link to choose a new password:\n${url}\n\nThis link expires in 30 minutes and works once. If you did not request this, ignore this email.`
        : `Verify your email to receive your purchase invoices:\n${url}\n\nThis link expires in 24 hours and works once. If you did not create this account, ignore this email.`,
    });
  } catch (error) {
    await AuthToken.deleteOne({ user: user._id, purpose, tokenHash });
    throw error;
  }
}
async function consume(raw, purpose) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(raw)) return null;
  return AuthToken.findOneAndDelete({ tokenHash: hashToken(raw), purpose, expiresAt: { $gt: new Date() } });
}
module.exports = { issue, consume };

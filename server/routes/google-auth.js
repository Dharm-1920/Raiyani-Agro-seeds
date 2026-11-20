const router = require('express').Router();
const jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs'), crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { User, AuthToken } = require('../models');
const { protect } = require('../middleware');
const { sign, newToken, publicOrigin, normalizeEmail, hashToken } = require('../services/identity');
// Google blocks sign-in inside app web views, so the Android app signs in through the phone's browser
// and receives a short-lived one-time code bound to a secret only the app knows (PKCE-style).
const APP_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const APP_NEXT = /^\/(?:home|shop|cart|checkout|orders|account|login)?(?:\?authError=[a-z_]+)?$/;
const appLink = params => `intent://auth?${new URLSearchParams(params)}#Intent;scheme=raiyaniagroseeds;package=com.raiyani.agroseeds;end`;
function backToApp(res, params) {
  const href = appLink(params).replace(/&/g, '&amp;');
  res.set('Cache-Control', 'no-store').type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${href}"><title>Raiyani Agro Seeds</title></head><body style="font-family:system-ui,sans-serif;background:#f7f5ef;color:#173c28;display:grid;place-items:center;min-height:90vh;text-align:center;padding:20px"><div><h1 style="font-size:22px">${params.code ? 'Signed in with Google' : 'Google sign-in did not finish'}</h1><p>Return to the Raiyani Agro Seeds app to continue.</p><p><a href="${href}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:#173c28;color:#fff;text-decoration:none;font-weight:600">Open the app</a></p></div></body></html>`);
}
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
    const appChallenge = !linkId && typeof req.query.app_challenge === 'string' && APP_CHALLENGE.test(req.query.app_challenge) ? req.query.app_challenge : undefined;
    res.cookie(cookieName, jwt.sign({ purpose: 'google-state', state, nonce, verifier, next, ...(appChallenge ? { appChallenge } : {}), ...(linkId ? { linkId: String(linkId), version: req.user.authVersion || 0 } : {}) }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '10m' }), cookieOptions());
    res.redirect(oauth.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, nonce, prompt: 'select_account', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }));
  } catch { res.redirect(new URL('/login?authError=google_unavailable', publicOrigin()).toString()); }
}
router.get('/google/start', (req, res) => begin(req, res));
router.get('/google/link', protect, (req, res) => begin(req, res, req.user._id));
router.get('/google/callback', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const { maxAge, ...clearOptions } = cookieOptions();
  res.clearCookie(cookieName, clearOptions);
  let link = false, app = false;
  try {
    const state = jwt.verify(req.cookies[cookieName], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    app = Boolean(state.appChallenge);
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
      if (await User.findOne({ email })) return app ? backToApp(res, { error: 'google_link_required' }) : res.redirect(new URL('/login?authError=google_link_required', publicOrigin()).toString());
      user = await User.create({ name: String(google.name || email.split('@')[0]).slice(0, 120), email, googleId: google.sub, emailVerified: true, passwordEnabled: false, password: await bcrypt.hash(newToken(), 10) });
    }
    if (app) {
      const code = newToken();
      await AuthToken.findOneAndUpdate({ user: user._id, purpose: 'app-login' }, { $set: { tokenHash: hashToken(code), challenge: state.appChallenge, expiresAt: new Date(Date.now() + 2 * 60000) } }, { upsert: true });
      return backToApp(res, { code, next: state.next === '/' ? '/home' : state.next });
    }
    sign(res, user); res.redirect(new URL(link ? '/account?google=connected' : state.next, publicOrigin()).toString());
  } catch {
    if (app) return backToApp(res, { error: 'google_failed' });
    res.redirect(new URL(link ? '/account?google=failed' : '/login?authError=google_failed', publicOrigin()).toString());
  }
});
// The app opens this inside its own window with the one-time code and its secret to finish signing in.
router.get('/app-login', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const next = typeof req.query.next === 'string' && APP_NEXT.test(req.query.next) ? req.query.next : '/home';
  try {
    const { code, verifier } = req.query;
    if (typeof code !== 'string' || typeof verifier !== 'string' || code.length > 200 || verifier.length > 200) throw new Error('Missing code');
    const record = await AuthToken.findOneAndDelete({ tokenHash: hashToken(code), purpose: 'app-login', expiresAt: { $gt: new Date() } });
    if (!record || crypto.createHash('sha256').update(verifier).digest('base64url') !== record.challenge) throw new Error('Invalid code');
    const user = await User.findById(record.user);
    if (!user) throw new Error('No user');
    sign(res, user);
    res.redirect(new URL(next, publicOrigin()).toString());
  } catch { res.redirect(new URL('/login?authError=google_failed', publicOrigin()).toString()); }
});
module.exports = router;

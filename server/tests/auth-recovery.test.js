const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), cookieParser = require('cookie-parser'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { User, AuthToken } = require('../models');
const mail = require('../services/mail');
const { normalizePhone, normalizeEmail, hashToken, newToken } = require('../services/identity');
const accountTokens = require('../services/account-tokens');
const uid = '000000000000000000000001';
let users, tokens, messages, server, base, googlePayload, oauthCalls;
function query(value) { return { select: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
User.findOne = async q => users.find(user => Object.entries(q).every(([key, value]) => user[key] === value)) || null;
User.findById = id => query(users.find(user => String(user._id) === String(id)) || null);
User.find = q => ({ limit: async n => users.filter(user => q.phone.$in.includes(user.phone) && !user.phoneLogin).slice(0, n) });
User.create = async data => {
  if (users.some(user => user.email === data.email || data.phoneLogin && user.phoneLogin === data.phoneLogin)) throw Object.assign(Error('duplicate'), { code: 11000 });
  const user = { _id: String(users.length + 1).padStart(24, '0'), role: 'user', authVersion: 0, ...data, save: async () => {} }; users.push(user); return user;
};
User.findOneAndUpdate = async (q, update) => {
  const user = users.find(user => String(user._id) === String(q._id));
  if (!user) return null;
  Object.assign(user, update.$set || {});
  for (const [key, increment] of Object.entries(update.$inc || {})) user[key] = (user[key] || 0) + increment;
  return user;
};
AuthToken.findOneAndUpdate = async (q, update) => { tokens = tokens.filter(token => token.user !== q.user || token.purpose !== q.purpose); const token = { ...q, ...update.$set }; tokens.push(token); return token; };
AuthToken.findOneAndDelete = async q => { const index = tokens.findIndex(token => token.tokenHash === q.tokenHash && token.purpose === q.purpose && token.expiresAt > q.expiresAt.$gt); return index < 0 ? null : tokens.splice(index, 1)[0]; };
AuthToken.deleteOne = async q => { tokens = tokens.filter(token => token.tokenHash !== q.tokenHash); };
AuthToken.deleteMany = async q => { tokens = tokens.filter(token => token.user !== q.user); };
mail.send = async message => { messages.push(message); return 'message-id'; };
OAuth2Client.prototype.getToken = async () => { oauthCalls++; return { tokens: { id_token: 'verified-by-test-double' } }; };
OAuth2Client.prototype.verifyIdToken = async function (options) { assert.equal(options.audience, 'test-google-client'); return { getPayload: () => googlePayload }; };
before(async () => {
  process.env.JWT_SECRET = 'auth-recovery-test-secret'; process.env.APP_URL = 'http://localhost:5173';
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/api/auth', require('../routes/auth'));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());
beforeEach(() => {
  users = [{ _id: uid, name: 'Farmer', email: 'farmer@example.com', password: bcrypt.hashSync('original-password', 4), role: 'user', authVersion: 0, phone: '9876543210', save: async () => {} }];
  tokens = []; messages = []; oauthCalls = 0;
  delete process.env.SMTP_HOST; delete process.env.BREVO_API_KEY; delete process.env.MAIL_FROM;
  process.env.GOOGLE_CLIENT_ID = 'test-google-client'; process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret'; process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5173/api/auth/google/callback';
});
const request = (path, body, cookie) => fetch(base + '/api/auth' + path, { method: body ? 'POST' : 'GET', redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const cookie = response => response.headers.getSetCookie().find(value => value.startsWith('token='))?.split(';')[0];
const enableMail = () => { process.env.BREVO_API_KEY = 'test-key'; process.env.MAIL_FROM = 'shop@example.com'; };
function linkToken(message) { return new URL(message.text.match(/http[^\s]+/)[0]).hash.slice(7); }
async function beginGoogle(session) {
  const response = await request(session ? '/google/link' : '/google/start?next=//evil.example', undefined, session);
  const oauthCookie = response.headers.getSetCookie().find(value => value.startsWith('google_oauth=')).split(';')[0];
  const state = jwt.verify(decodeURIComponent(oauthCookie.split('=')[1]), process.env.JWT_SECRET);
  return { oauthCookie, state, response };
}
test('phone and email normalization reject malformed identifiers', () => {
  assert.equal(normalizePhone('98765 43210'), '+919876543210'); assert.equal(normalizePhone('+44 7911 123456'), '+447911123456');
  for (const input of ['phone', '+91++123', { $gt: '' }, '123']) assert.equal(normalizePhone(input), null);
  assert.equal(normalizeEmail(' FARMER@example.com '), 'farmer@example.com'); assert.equal(normalizeEmail({ $ne: '' }), '');
});
test('email signup normalizes data, hashes passwords, ignores admin role and returns no credentials', async () => {
  const response = await request('/register', { name: ' New farmer ', email: ' NEW@example.com ', phone: '9123456789', password: 'new-password', role: 'admin' });
  assert.equal(response.status, 201); const data = await response.json();
  assert.equal(data.user.email, 'new@example.com'); assert.equal(data.user.phone, '+919123456789'); assert.equal(data.user.role, 'user'); assert.equal(data.user.emailVerified, false);
  assert.equal(data.user.password, undefined); assert.equal(data.verificationEmailSent, false); assert.ok(await bcrypt.compare('new-password', users[1].password)); assert.ok(cookie(response));
});
test('weak, overlong and duplicate signup details are rejected', async () => {
  for (const password of ['short', 'x'.repeat(73)]) assert.equal((await request('/register', { name: 'Name', email: 'new@example.com', password })).status, 400);
  assert.equal((await request('/register', { name: 'Name', email: 'farmer@example.com', password: 'valid-password' })).status, 409);
  assert.equal(users.length, 1);
});
test('phone password login supports an unambiguous older account and rejects a wrong password', async () => {
  const response = await request('/login', { method: 'phone', phone: '+91 9876543210', password: 'original-password' });
  assert.equal(response.status, 200); assert.ok(cookie(response));
  assert.equal((await request('/login', { method: 'phone', phone: '9876543210', password: 'wrong-password' })).status, 401);
  users.push({ ...users[0], _id: '000000000000000000000002', email: 'other@example.com' });
  assert.equal((await request('/login', { method: 'phone', phone: '9876543210', password: 'original-password' })).status, 401);
});
test('reset requests do not reveal account existence; token is hashed and never returned in JSON', async () => {
  enableMail();
  const known = await request('/forgot-password', { email: 'FARMER@example.com' }), unknown = await request('/forgot-password', { email: 'unknown@example.com' });
  assert.equal(known.status, 202); assert.equal(unknown.status, 202); assert.deepEqual(await known.json(), await unknown.json());
  assert.equal(messages.length, 1); const raw = linkToken(messages[0]); assert.equal(tokens[0].tokenHash, hashToken(raw)); assert.notEqual(tokens[0].tokenHash, raw);
});
test('reset delivery that is not configured returns an honest unavailable response', async () => {
  assert.equal((await request('/forgot-password', { email: 'farmer@example.com' })).status, 503); assert.equal(tokens.length, 0);
});
test('reset links expire, work once, and invalidate all previous sessions', async () => {
  enableMail(); const oldSession = cookie(await request('/login', { email: 'farmer@example.com', password: 'original-password' }));
  await accountTokens.issue(users[0], 'reset'); let raw = linkToken(messages.at(-1)); tokens[0].expiresAt = new Date(Date.now() - 1);
  assert.equal((await request('/reset-password', { token: raw, password: 'replacement-password' })).status, 400);
  await accountTokens.issue(users[0], 'reset'); raw = linkToken(messages.at(-1));
  assert.equal((await request('/reset-password', { token: raw, password: 'replacement-password' })).status, 200);
  assert.equal((await request('/reset-password', { token: raw, password: 'another-password' })).status, 400);
  assert.equal((await request('/me', undefined, oldSession)).status, 401);
  assert.equal((await request('/login', { email: 'farmer@example.com', password: 'original-password' })).status, 401);
  assert.equal((await request('/login', { email: 'farmer@example.com', password: 'replacement-password' })).status, 200);
  assert.equal(users[0].emailVerified, true);
});
test('verification links cannot reset passwords and reset links cannot verify email', async () => {
  enableMail(); await accountTokens.issue(users[0], 'verify'); const raw = linkToken(messages[0]);
  assert.equal((await request('/reset-password', { token: raw, password: 'replacement-password' })).status, 400);
  assert.equal((await request('/verify-email', { token: raw })).status, 200);
  assert.equal((await request('/verify-email', { token: raw })).status, 400);
  assert.ok(await bcrypt.compare('original-password', users[0].password));
});
test('an email outage invalidates the unsent link without exposing it', async () => {
  const send = mail.send; mail.send = async () => { throw Error('provider unavailable'); };
  try { await assert.rejects(accountTokens.issue(users[0], 'reset')); assert.equal(tokens.length, 0); }
  finally { mail.send = send; }
});
test('Google OAuth uses state, nonce, PKCE and refuses an external return address', async () => {
  const { response, state } = await beginGoogle(); const url = new URL(response.headers.get('location'));
  assert.equal(url.hostname, 'accounts.google.com'); assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), state.state); assert.equal(url.searchParams.get('nonce'), state.nonce); assert.equal(state.next, '/');
});
test('Google rejects mismatched state before contacting Google or signing in', async () => {
  const { oauthCookie } = await beginGoogle();
  const response = await request('/google/callback?state=wrong&code=code', undefined, oauthCookie);
  assert.match(response.headers.get('location'), /google_failed/); assert.equal(oauthCalls, 0); assert.equal(cookie(response), undefined);
});
test('Google cannot silently attach itself to an existing password account', async () => {
  const { oauthCookie, state } = await beginGoogle(); googlePayload = { sub: 'google-id', email: 'farmer@example.com', email_verified: true, nonce: state.nonce };
  const response = await request(`/google/callback?state=${state.state}&code=code`, undefined, oauthCookie);
  assert.match(response.headers.get('location'), /google_link_required/); assert.equal(users[0].googleId, undefined); assert.equal(cookie(response), undefined);
});
test('Google creates a verified customer account and links existing accounts only with their session', async () => {
  let flow = await beginGoogle(); googlePayload = { sub: 'new-google-id', email: 'google@example.com', email_verified: true, nonce: flow.state.nonce, name: 'Google Farmer' };
  const created = await request(`/google/callback?state=${flow.state.state}&code=code`, undefined, flow.oauthCookie);
  assert.ok(cookie(created)); assert.equal(users[1].passwordEnabled, false); assert.equal(users[1].emailVerified, true); assert.equal(users[1].role, 'user');
  const session = cookie(await request('/login', { email: 'farmer@example.com', password: 'original-password' }));
  flow = await beginGoogle(session); googlePayload = { sub: 'existing-google-id', email: 'farmer@example.com', email_verified: true, nonce: flow.state.nonce };
  const linked = await request(`/google/callback?state=${flow.state.state}&code=code`, undefined, flow.oauthCookie + '; ' + session);
  assert.match(linked.headers.get('location'), /google=connected/); assert.equal(users[0].googleId, 'existing-google-id');
});
test('Google rejects unverified email and a mismatched ID-token nonce', async () => {
  for (const payload of [{ email_verified: false }, { email_verified: true, nonce: 'wrong' }]) {
    const flow = await beginGoogle(); googlePayload = { sub: 'new-id', email: 'new@example.com', nonce: flow.state.nonce, ...payload };
    const response = await request(`/google/callback?state=${flow.state.state}&code=code`, undefined, flow.oauthCookie);
    assert.match(response.headers.get('location'), /google_failed/); assert.equal(cookie(response), undefined);
  }
  assert.equal(users.length, 1);
});
test('random and tampered reset tokens never change the account password', async () => {
  const original = users[0].password;
  for (const token of [newToken(), { $gt: '' }, 'bad']) assert.equal((await request('/reset-password', { token, password: 'replacement-password' })).status, 400);
  assert.equal(users[0].password, original);
});

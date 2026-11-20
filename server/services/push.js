// Instant Android notifications through Firebase Cloud Messaging (HTTP v1).
// Disabled until FIREBASE_SERVICE_ACCOUNT holds the Firebase service-account JSON.
const jwt = require('jsonwebtoken');
const { DeviceToken } = require('../models');

let cachedAccess = null; // { token, expires, email }

function account() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return { ...parsed, private_key: parsed.private_key.replace(/\\n/g, '\n') };
  } catch { return null; }
}
const configured = () => Boolean(account());

async function accessToken(sa, fetcher) {
  if (cachedAccess && cachedAccess.email === sa.client_email && cachedAccess.expires > Date.now() + 60000) return cachedAccess.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, sa.private_key, { algorithm: 'RS256' });
  const response = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  if (!response.ok) throw Error('Firebase sign-in failed');
  const data = await response.json();
  cachedAccess = { token: data.access_token, expires: Date.now() + (data.expires_in || 3600) * 1000, email: sa.client_email };
  return cachedAccess.token;
}

// Data-only messages so the app can show the customer's chosen language.
function payload(notice) {
  const text = value => String(value || '').slice(0, 900);
  return {
    id: String(notice._id || notice.eventKey || ''), type: text(notice.type),
    title: text(notice.title), titleGu: text(notice.titleGu), message: text(notice.message), messageGu: text(notice.messageGu),
    link: typeof notice.link === 'string' && notice.link.startsWith('/') && !notice.link.startsWith('//') ? notice.link : '/notifications',
  };
}

/** Sends one notification to every app installation signed in to this account. Never throws. */
async function pushToUser(user, notice, { fetcher = global.fetch } = {}) {
  const sa = account();
  if (!sa) return { sent: 0, skipped: 'not-configured' };
  let sent = 0;
  try {
    const devices = await DeviceToken.find({ user }).limit(20);
    if (!devices.length) return { sent: 0 };
    const auth = await accessToken(sa, fetcher), data = payload(notice);
    for (const device of devices) {
      const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: device.token, data, android: { priority: 'HIGH', ttl: '86400s' } } }),
      });
      if (response.ok) { sent++; continue; }
      // The app was uninstalled or the token rotated: forget it.
      if (response.status === 404 || response.status === 400) await DeviceToken.deleteOne({ token: device.token });
      if (response.status === 401) cachedAccess = null;
    }
  } catch (error) {
    console.error('Push notification failed:', error.message);
  }
  return { sent };
}

const validToken = token => typeof token === 'string' && token.length >= 20 && token.length <= 4096 && /^[\w:.\-]+$/.test(token);

/** Links an app installation to the signed-in account (moving it if another account used this phone before). */
async function registerDevice(user, token) {
  if (!validToken(token)) { const error = Error('Invalid device token'); error.status = 400; throw error; }
  await DeviceToken.updateOne({ token }, { $set: { user, platform: 'android' } }, { upsert: true });
}

module.exports = { configured, pushToUser, registerDevice, payload, validToken, _reset: () => { cachedAccess = null; } };

// Firebase push: fake Google endpoints and an in-memory device list. Nothing leaves this machine.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { DeviceToken, Notification } = require('../models');
const push = require('../services/push');
const notifications = require('../services/notifications');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const serviceAccount = JSON.stringify({ project_id: 'ras-test', client_email: 'push@ras-test.iam.gserviceaccount.com', private_key: privateKey });
const user = '000000000000000000000001', other = '000000000000000000000002';
const tokenA = 'device-token-aaaaaaaaaaaaaaaaaaaa', tokenB = 'device-token-bbbbbbbbbbbbbbbbbbbb';
let devices, calls, fcmStatus;
const originals = { find: DeviceToken.find, deleteOne: DeviceToken.deleteOne, updateOne: DeviceToken.updateOne, notice: Notification.updateOne, fetch: global.fetch, env: process.env.FIREBASE_SERVICE_ACCOUNT };

DeviceToken.find = q => ({ limit: () => Promise.resolve(devices.filter(d => String(d.user) === String(q.user))) });
DeviceToken.deleteOne = async q => { devices = devices.filter(d => d.token !== q.token); };
DeviceToken.updateOne = async (q, u) => { const found = devices.find(d => d.token === q.token); if (found) Object.assign(found, u.$set); else devices.push({ token: q.token, ...u.$set }); };
const fetcher = async (url, options) => {
  calls.push({ url, options });
  if (url.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'access-1', expires_in: 3600 }) };
  const status = fcmStatus.shift() ?? 200;
  return { ok: status === 200, status, json: async () => ({}) };
};

beforeEach(() => {
  devices = [{ token: tokenA, user }, { token: tokenB, user }, { token: 'someone-elses-token-cccccccccc', user: other }];
  calls = []; fcmStatus = [];
  process.env.FIREBASE_SERVICE_ACCOUNT = serviceAccount;
  push._reset();
});
after(() => {
  Object.assign(DeviceToken, { find: originals.find, deleteOne: originals.deleteOne, updateOne: originals.updateOne });
  Notification.updateOne = originals.notice; global.fetch = originals.fetch;
  if (originals.env === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT; else process.env.FIREBASE_SERVICE_ACCOUNT = originals.env;
});

test('push stays off without a Firebase service account', async () => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  assert.equal(push.configured(), false);
  assert.deepEqual(await push.pushToUser(user, { title: 'Hi' }, { fetcher }), { sent: 0, skipped: 'not-configured' });
  assert.equal(calls.length, 0);
});

test('a notification reaches only this account\'s phones with both languages and a safe link', async () => {
  const result = await push.pushToUser(user, { _id: 'n1', type: 'delivery', title: 'Order shipped', titleGu: 'ઓર્ડર મોકલ્યો', message: 'On its way', messageGu: 'રસ્તામાં છે', link: '//evil.example' }, { fetcher });
  assert.equal(result.sent, 2);
  const sends = calls.filter(c => c.url.includes('fcm.googleapis.com'));
  assert.equal(sends.length, 2);
  assert.ok(sends.every(c => c.url.includes('/projects/ras-test/messages:send') && c.options.headers.Authorization === 'Bearer access-1'));
  const body = JSON.parse(sends[0].options.body).message;
  assert.equal(body.token, tokenA);
  assert.equal(body.android.priority, 'HIGH');
  assert.deepEqual(body.data, { id: 'n1', type: 'delivery', title: 'Order shipped', titleGu: 'ઓર્ડર મોકલ્યો', message: 'On its way', messageGu: 'રસ્તામાં છે', link: '/notifications' });
  // The Google sign-in token is reused for the next send.
  await push.pushToUser(user, { _id: 'n2', title: 'Again' }, { fetcher });
  assert.equal(calls.filter(c => c.url.includes('oauth2')).length, 1);
});

test('uninstalled phones are forgotten and failures never throw', async () => {
  fcmStatus = [404, 200];
  const result = await push.pushToUser(user, { _id: 'n3', title: 'Back in stock', link: '/product/abc' }, { fetcher });
  assert.equal(result.sent, 1);
  assert.deepEqual(devices.map(d => d.token), [tokenB, 'someone-elses-token-cccccccccc']);
  const broken = async () => { throw Error('offline'); };
  assert.deepEqual(await push.pushToUser(user, { title: 'x' }, { fetcher: broken }), { sent: 0 });
});

test('registering a phone validates the token and moves it to the signed-in account', async () => {
  await assert.rejects(push.registerDevice(user, 'short'), { status: 400 });
  await assert.rejects(push.registerDevice(user, 'has spaces in it but is long enough'), { status: 400 });
  await push.registerDevice(other, tokenA);
  assert.equal(devices.find(d => d.token === tokenA).user, other);
});

test('only brand-new notifications are pushed, so retries never alert twice', async () => {
  global.fetch = fetcher;
  Notification.updateOne = async () => ({ upsertedCount: 1, upsertedId: 'new-id' });
  await notifications.send(user, 'delivery:1', { type: 'delivery', title: 'Delivered' });
  assert.equal(calls.filter(c => c.url.includes('fcm')).length, 2);
  Notification.updateOne = async () => ({ upsertedCount: 0 });
  await notifications.send(user, 'delivery:1', { type: 'delivery', title: 'Delivered' });
  assert.equal(calls.filter(c => c.url.includes('fcm')).length, 2);
});

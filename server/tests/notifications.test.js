// Isolated HTTP and persistence doubles: never change shop accounts, orders or stock.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Notification, StockSubscription, Product, User, Order, Message } = require('../models');
const service = require('../services/notifications');
const meta = require('../services/whatsapp-meta');
const { WhatsAppPreference } = require('../models');
const a = '000000000000000000000001', b = '000000000000000000000002';
const admin = '000000000000000000000003', admin2 = '000000000000000000000004';
const pid = '000000000000000000000020', oid = '000000000000000000000030';
let notices, subscriptions, product, order, failInsert, failSubscriptionComplete, counter, server, base;
const clone = value => structuredClone(value);
const matches = (doc, query) => Boolean(doc) && Object.entries(query).every(([key, value]) => {
  if (key === '$or') return value.some(q => matches(doc, q));
  if (value && typeof value === 'object') {
    if ('$ne' in value) return String(doc[key]) !== String(value.$ne);
    if ('$gt' in value) return doc[key] > value.$gt;
    if ('$gte' in value) return doc[key] >= value.$gte;
    if ('$in' in value) return value.$in.includes(doc[key]);
  }
  return String(doc[key]) === String(value);
});
function query(rows) {
  return { sort() { return this; }, skip(n) { rows = rows.slice(n); return this; }, limit(n) { rows = rows.slice(0, n); return this; }, select() { return this; }, then(resolve, reject) { return Promise.resolve(clone(rows)).then(resolve, reject); } };
}
Notification.updateOne = async (q, u) => {
  if (failInsert) { failInsert = false; throw Error('Temporary notification failure'); }
  if (!notices.some(n => matches(n, q))) notices.push({ _id: (++counter).toString(16).padStart(24, '0'), isRead: false, createdAt: new Date().toISOString(), ...clone(u.$setOnInsert) });
};
Notification.find = q => query(notices.filter(n => matches(n, q)));
Notification.countDocuments = async q => notices.filter(n => matches(n, q)).length;
Message.countDocuments = async () => 3;
Notification.updateMany = async (q, u) => { notices.filter(n => matches(n, q)).forEach(n => Object.assign(n, u.$set)); };
Notification.findOneAndUpdate = async (q, u) => { const n = notices.find(n => matches(n, q)); if (!n) return null; Object.assign(n, u.$set); return clone(n); };
StockSubscription.find = async q => clone(subscriptions.filter(s => matches(s, q)));
StockSubscription.distinct = async (field, q) => [...new Set(subscriptions.filter(s => matches(s, q)).map(s => s[field]))];
StockSubscription.updateOne = async (q, u, options) => {
  if (failSubscriptionComplete && u.$set?.notifiedAt) { failSubscriptionComplete = false; throw Error('Interrupted after notification insertion'); }
  const s = subscriptions.find(s => matches(s, q));
  if (s) Object.assign(s, u.$set || {});
  else if (options?.upsert) subscriptions.push({ _id: (++counter).toString(16).padStart(24, '0'), ...clone(u.$setOnInsert) });
};
StockSubscription.updateMany = async (q, u) => { subscriptions.filter(s => matches(s, q)).forEach(s => Object.assign(s, u.$set)); };
Product.findOne = async q => matches(product, q) ? clone(product) : null;
Product.findOneAndUpdate = async (q, u) => { if (!matches(product, q)) return null; product.stock += u.$inc.stock; return clone(product); };
User.findById = id => ({ select: async () => ({ _id: id, name: 'Customer', role: [admin, admin2].includes(id) ? 'admin' : 'user' }) });
User.find = () => query([{ _id: admin }, { _id: admin2 }]);
Order.find = q => query(matches(order, q) ? [order] : []);
Order.findById = async id => String(id) === String(order?._id) ? clone(order) : null;
Order.updateOne = async (q, u) => { if (matches(order, q)) Object.assign(order, u.$set); };
Order.findOneAndUpdate = async (q, u) => { if (!matches(order, q)) return null; Object.assign(order, u.$set); return clone(order); };
Order.create = async data => { order = { ...clone(data), _id: oid }; return clone(order); };
before(async () => {
  process.env.JWT_SECRET = 'notification-test-secret';
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.cookies = {}; next(); });
  app.use('/notifications', require('../routes/notifications'));
  app.use('/orders', require('../routes/orders'));
  app.use('/admin', require('../routes/admin'));
  app.use((error, req, res, next) => res.status(503).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());
beforeEach(() => {
  counter = 100; notices = []; subscriptions = []; failInsert = false; failSubscriptionComplete = false;
  product = { _id: pid, name: 'Agricultural pump', nameGu: 'કૃષિ પંપ', stock: 0, isActive: true, isDeleted: false, price: 3500 };
  order = { _id: oid, user: a, items: [{ product: pid, name: product.name, nameGu: product.nameGu, qty: 2 }], shipping: { name: 'Alice' }, totalAmount: 7000, paymentMethod: 'cod', orderStatus: 'shipped', paymentStatus: 'pending' };
});
function request(path, user, method = 'GET', body) {
  return fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
test('guests cannot read or subscribe; stale account writes are rejected', async () => {
  assert.equal((await request('/notifications', null)).status, 401);
  assert.equal((await request('/notifications/subscriptions/' + pid, null, 'POST')).status, 401);
  assert.equal((await request('/notifications/subscriptions/' + pid, b, 'POST', { accountId: a })).status, 403);
  assert.equal(subscriptions.length, 0);
});

test('WhatsApp restock enrollment requires configured service, explicit consent and a valid number', async () => {
  const original = meta.configured;
  const originalPreference = WhatsAppPreference.exists;
  try {
    meta.configured = () => true; WhatsAppPreference.exists = async () => false;
    const endpoint = '/notifications/subscriptions/' + pid;
    assert.equal((await request(endpoint, a, 'POST', { whatsapp: true, whatsappPhone: '+919876543210' })).status, 400);
    assert.equal((await request(endpoint, a, 'POST', { whatsapp: true, whatsappPhone: 'wrong', whatsappConsent: true })).status, 400);
    assert.equal(subscriptions.length, 0);
    assert.equal((await request(endpoint, a, 'POST', { whatsapp: true, whatsappPhone: '9876543210', whatsappConsent: true, language: 'gu' })).status, 201);
    assert.equal(subscriptions[0].whatsappPhone, '+919876543210'); assert.equal(subscriptions[0].language, 'gu'); assert.ok(subscriptions[0].whatsappConsentAt);
    await request(endpoint, a, 'DELETE'); assert.equal(subscriptions[0].whatsapp, false); assert.ok(subscriptions[0].cancelledAt);
    WhatsAppPreference.exists = async () => true;
    assert.equal((await request(endpoint, a, 'POST', { whatsapp: true, whatsappPhone: '9876543210', whatsappConsent: true })).status, 400);
    meta.configured = () => false; WhatsAppPreference.exists = async () => false;
    assert.equal((await request(endpoint, a, 'POST', { whatsapp: true, whatsappPhone: '9876543210', whatsappConsent: true })).status, 400);
  } finally { meta.configured = original; WhatsAppPreference.exists = originalPreference; }
});
test('subscriptions are idempotent, private and cancellable', async () => {
  await Promise.all([request('/notifications/subscriptions/' + pid, a, 'POST'), request('/notifications/subscriptions/' + pid, a, 'POST')]);
  assert.equal(subscriptions.length, 1);
  assert.deepEqual((await (await request('/notifications', a)).json()).subscriptions, [pid]);
  assert.deepEqual((await (await request('/notifications', b)).json()).subscriptions, []);
  await request('/notifications/subscriptions/' + pid, b, 'DELETE');
  assert.equal(subscriptions[0].active, true);
  await request('/notifications/subscriptions/' + pid, a, 'DELETE');
  product.stock = 5; await service.notifyRestockedProduct(pid);
  assert.equal(notices.length, 0);
});
test('available, hidden and deleted products cannot be subscribed to', async () => {
  product.stock = 1;
  assert.equal((await request('/notifications/subscriptions/' + pid, a, 'POST')).status, 409);
  product.stock = 0; product.isActive = false;
  assert.equal((await request('/notifications/subscriptions/' + pid, a, 'POST')).status, 404);
  product.isActive = true; product.isDeleted = true;
  assert.equal((await request('/notifications/subscriptions/' + pid, a, 'POST')).status, 404);
  assert.equal((await request('/notifications/subscriptions/bad-id', a, 'POST')).status, 400);
});
test('restocking notifies subscribers in both languages once; a later stock cycle can be requested', async () => {
  await request('/notifications/subscriptions/' + pid, a, 'POST');
  await service.notifyRestockedProduct(pid); assert.equal(notices.length, 0);
  product.stock = 4;
  await service.notifyRestockedProduct(pid); await service.notifyRestockedProduct(pid);
  assert.equal(notices.length, 1); assert.equal(notices[0].user, a);
  assert.match(notices[0].messageGu, /કૃષિ પંપ/); assert.equal(notices[0].link, '/product/' + pid);
  product.stock = 0; await request('/notifications/subscriptions/' + pid, a, 'POST');
  product.stock = 2; await service.notifyRestockedProduct(pid); assert.equal(notices.length, 2);
});
test('restock retries recover failures without duplicate notifications', async () => {
  await request('/notifications/subscriptions/' + pid, a, 'POST'); product.stock = 2;
  failInsert = true; await assert.rejects(service.notifyRestockedProduct(pid));
  assert.equal(subscriptions[0].active, true);
  failSubscriptionComplete = true; await assert.rejects(service.notifyRestockedProduct(pid));
  assert.equal(notices.length, 1);
  await service.retryPending(); assert.equal(notices.length, 1); assert.equal(subscriptions[0].active, false);
});
test('unread counts and read actions apply only to the signed-in recipient', async () => {
  await service.send(a, 'test-a', { type: 'restock' }); await service.send(b, 'test-b', { type: 'restock' });
  const own = notices[0]._id, theirs = notices[1]._id;
  assert.equal((await request('/notifications/' + theirs + '/read', a, 'PUT')).status, 404);
  assert.equal((await (await request('/notifications', a)).json()).unread, 1);
  assert.equal((await request('/notifications/' + own + '/read', a, 'PUT')).status, 200);
  await request('/notifications/read-all', a, 'PUT');
  assert.equal((await (await request('/notifications', b)).json()).unread, 1);
  assert.equal((await (await request('/notifications', a)).json()).unread, 0);
});
test('new checkout notifies every admin with purchased products, without claiming payment received', async () => {
  product.stock = 5;
  const response = await request('/orders', a, 'POST', { items: [{ productId: pid, qty: 2 }], shipping: { name: 'Alice', phone: '1234567890', address: 'Gondal' }, paymentMethod: 'cod' });
  assert.equal(response.status, 201); assert.equal(notices.length, 2);
  assert.deepEqual(notices.map(n => n.user).sort(), [admin, admin2]);
  assert.match(notices[0].message, /Alice ordered Agricultural pump × 2/);
  assert.match(notices[0].messageGu, /કૃષિ પંપ/);
  assert.equal(order.adminNoticePending, false);
});
test('delivery status change alerts only the order owner and repeated saves do not resend', async () => {
  assert.equal((await request('/admin/orders/' + oid + '/status', b, 'PUT', { orderStatus: 'delivered' })).status, 403);
  assert.equal((await request('/admin/orders/' + oid + '/status', admin, 'PUT', { orderStatus: 'delivered' })).status, 200);
  assert.equal(notices.length, 1); assert.equal(notices[0].user, a); assert.equal(notices[0].type, 'delivery');
  assert.equal(order.deliveryNoticePending, false); assert.equal(order.paymentStatus, 'paid');
  await request('/admin/orders/' + oid + '/status', admin, 'PUT', { orderStatus: 'delivered' });
  assert.equal(notices.length, 1);
});
test('a notification outage does not reject delivery; the worker completes the pending alert', async () => {
  failInsert = true;
  assert.equal((await request('/admin/orders/' + oid + '/status', admin, 'PUT', { orderStatus: 'delivered' })).status, 200);
  assert.equal(order.deliveryNoticePending, true); assert.equal(notices.length, 0);
  await service.retryPending(); assert.equal(notices.length, 1); assert.equal(order.deliveryNoticePending, false);
});
test('legacy orders produce no historical purchase or delivery alerts', async () => {
  await service.retryPending(); assert.equal(notices.length, 0);
});
test('purchase notification failures keep a successful checkout and are retried for all admins', async () => {
  product.stock = 5; failInsert = true;
  const response = await request('/orders', a, 'POST', { items: [{ productId: pid, qty: 1 }], shipping: { name: 'Alice', phone: '1234567890', address: 'Gondal' }, paymentMethod: 'cod' });
  assert.equal(response.status, 201); assert.equal(order.adminNoticePending, true);
  await service.retryPending(); assert.equal(notices.length, 2); assert.equal(order.adminNoticePending, false);
  await service.retryPending(); assert.equal(notices.length, 2);
});
test('hidden products do not send pending restock alerts until available in the shop', async () => {
  await request('/notifications/subscriptions/' + pid, a, 'POST');
  product.stock = 2; product.isActive = false;
  await service.retryPending(); assert.equal(notices.length, 0); assert.equal(subscriptions[0].active, true);
  product.isActive = true; await service.retryPending(); assert.equal(notices.length, 1);
});
test('notification history is paginated with the total unread count retained', async () => {
  for (let i = 0; i < 35; i++) await service.send(a, 'notice-' + i, { type: 'restock' });
  const page1 = await (await request('/notifications', a)).json();
  const page2 = await (await request('/notifications?page=2', a)).json();
  assert.equal(page1.items.length, 30); assert.equal(page1.unread, 35); assert.equal(page1.pages, 2);
  assert.equal(page2.items.length, 5); assert.equal(page2.unread, 35);
  assert.equal(page2.items.some(n => page1.items.some(other => other._id === n._id)), false);
});
test('admin menu badges count all unread purchases and messages, independent of notification pagination', async () => {
  for (let i = 0; i < 35; i++) await service.send(admin, 'purchase-' + i, { type: 'purchase' });
  await service.send(admin, 'other', { type: 'restock' });
  const data = await (await request('/notifications', admin)).json();
  assert.equal(data.items.length, 30); assert.equal(data.unread, 36);
  assert.deepEqual(data.menuCounts, { Orders: 35, Messages: 3 });
  assert.deepEqual((await (await request('/notifications', a)).json()).menuCounts, { Orders: 0, Messages: 0 });
});
test('viewing loaded orders clears only their purchase badges for the current admin', async () => {
  const newer = '000000000000000000000031';
  await service.send(admin, 'purchase:' + oid, { type: 'purchase' });
  await service.send(admin, 'purchase:' + newer, { type: 'purchase' });
  await service.send(admin2, 'purchase:' + oid, { type: 'purchase' });
  await service.send(admin, 'delivery:' + oid, { type: 'delivery' });
  const response = await request('/notifications/read-purchases', admin, 'PUT', { orderIds: [oid] });
  assert.equal(response.status, 200);
  const data = await (await request('/notifications', admin)).json();
  assert.equal(data.menuCounts.Orders, 1); assert.equal(data.unread, 2);
  assert.equal((await (await request('/notifications', admin2)).json()).menuCounts.Orders, 1);
});
test('purchase badge read endpoint rejects customers and invalid order lists', async () => {
  assert.equal((await request('/notifications/read-purchases', a, 'PUT', { orderIds: [oid] })).status, 403);
  assert.equal((await request('/notifications/read-purchases', admin, 'PUT', { orderIds: ['invalid'] })).status, 400);
  assert.equal((await request('/notifications/read-purchases', admin, 'PUT', { orderIds: Array(201).fill(oid) })).status, 400);
});

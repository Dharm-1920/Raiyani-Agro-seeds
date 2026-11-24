// Quick stock changes and dashboard work queues, using in-memory model doubles (no MongoDB).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Product, Order, User, Message } = require('../models');
const notifications = require('../services/notifications');
const admin = { _id: '000000000000000000000003', role: 'admin' };
const shopper = { _id: '000000000000000000000001', role: 'user' };
const productId = '000000000000000000000020';
let product, restocked, orderQuery, server, base;
User.findById = id => ({ select: async () => [admin, shopper].find(u => u._id === id) });
notifications.notifyRestockedProduct = async id => { restocked.push(String(id)); };
function matches(doc, q) {
  return Object.entries(q).every(([k, v]) => {
    if (v && typeof v === 'object' && '$ne' in v) return doc[k] !== v.$ne;
    if (v && typeof v === 'object' && '$gte' in v) return doc[k] >= v.$gte;
    return String(doc[k]) === String(v);
  });
}
Product.findOneAndUpdate = async (q, u) => { if (!product || !matches(product, q)) return null; product.stock += u.$inc.stock; return { ...product }; };
Product.findOne = async q => product && matches(product, q) ? { ...product } : null;
Order.find = q => { orderQuery = q; return { populate: () => ({ sort: () => ({ limit: async () => [] }) }) }; };
before(async () => {
  process.env.JWT_SECRET = 'test-session-secret';
  const app = express(); app.use(express.json()); app.use((req, res, next) => { req.cookies = {}; next(); });
  app.use('/api/products', require('../routes/products')); app.use('/api/admin', require('../routes/admin'));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());
beforeEach(() => { product = { _id: productId, name: 'Cotton seeds', stock: 2, isActive: true, isDeleted: false }; restocked = []; orderQuery = undefined; });
const send = (path, actor, body, method = 'PATCH') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ id: actor._id }, process.env.JWT_SECRET) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const stock = (delta, actor = admin) => send(`/api/products/${productId}/stock`, actor, { delta });

test('admin adds and removes stock by a relative amount', async () => {
  let r = await stock(5); assert.equal(r.status, 200); assert.equal((await r.json()).stock, 7);
  r = await stock(-3); assert.equal(r.status, 200); assert.equal(product.stock, 4);
  assert.deepEqual(restocked, [productId], 'only additions trigger back-in-stock alerts');
});
test('stock never goes below zero', async () => {
  const r = await stock(-3); assert.equal(r.status, 409); assert.equal(product.stock, 2);
});
test('stock changes must be non-zero whole numbers', async () => {
  for (const delta of [0, 1.5, 'abc', 20000]) assert.equal((await stock(delta)).status, 400);
  assert.equal(product.stock, 2);
});
test('customers cannot change stock and removed products are not found', async () => {
  assert.equal((await stock(1, shopper)).status, 403);
  product.isDeleted = true; assert.equal((await stock(1)).status, 404);
});
test('order work-queue filters map to safe queries', async () => {
  await send('/api/admin/orders?needs=payment', admin, null, 'GET');
  assert.equal(orderQuery.paymentMethod, 'upi'); assert.deepEqual(orderQuery.paymentReference, { $exists: true });
  await send('/api/admin/orders?needs=refund', admin, null, 'GET');
  assert.deepEqual(orderQuery, { orderStatus: 'cancelled', paymentStatus: 'paid' });
  await send('/api/admin/orders?needs=constructor', admin, null, 'GET');
  assert.deepEqual(orderQuery, {}, 'unknown queues fall back to all orders');
  await send('/api/admin/orders?status=shipped', admin, null, 'GET');
  assert.deepEqual(orderQuery, { orderStatus: 'shipped' });
});
test('dashboard stats include today and the work queues', async () => {
  Order.countDocuments = async () => 1; User.countDocuments = async () => 4; Product.countDocuments = async () => 9;
  Message.countDocuments = async () => 2;
  Order.aggregate = async pipeline => pipeline[0].$match?.createdAt ? [{ n: 3, t: 1250 }] : [];
  Product.find = () => ({ select: () => ({ sort: () => ({ limit: async () => [] }) }) });
  const data = await (await send('/api/admin/stats', admin, null, 'GET')).json();
  assert.deepEqual(data.attention, { todayOrders: 3, todaySales: 1250, toVerify: 1, toPack: 1, refunds: 1, unreadMessages: 2 });
});

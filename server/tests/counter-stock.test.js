const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const express = require('express'), jwt = require('jsonwebtoken');
const { Product, CounterBill, User } = require('../models');
const { prepareBill } = require('../services/counter-bills');
const { saveStockBill } = require('../services/counter-stock');
const admin = '000000000000000000000001', shopper = '000000000000000000000002';
const seedId = '000000000000000000000010', feedId = '000000000000000000000020';
let products, bills, updates, createError, transactionError, server, base, tail = Promise.resolve();
const session = {};
const draft = (key = 'stock-counter-request-123') => ({ requestKey: key, customer: { name: 'Counter customer' }, items: [{ productId: seedId, name: 'Old name', nameGu: 'old translation', unit: 'old unit', qty: '2.125', price: '90.50' }], paymentMethod: 'later', paymentStatus: 'pending', invoiceWhatsApp: false });
const data = (key) => ({ ...prepareBill(draft(key)), user: admin });

// Emulate transaction isolation and rollback so failures cannot leak stock or bills.
mongoose.connection.transaction = async callback => {
  const prior = tail; let release; tail = new Promise(resolve => { release = resolve; }); await prior;
  const snapshot = structuredClone({ products, bills });
  try { if (transactionError) throw transactionError; return await callback(session); }
  catch (error) { products = snapshot.products; bills = snapshot.bills; throw error; }
  finally { release(); }
};
CounterBill.findOne = query => {
  const value = () => structuredClone(bills.find(bill => bill.requestKey === query.requestKey) || null);
  return { session: async actual => { assert.equal(actual, session); return value(); }, then: (resolve, reject) => Promise.resolve(value()).then(resolve, reject) };
};
Product.findOneAndUpdate = async (query, change, options) => {
  assert.equal(options.session, session); assert.equal(options.new, true);
  assert.equal(query.isActive, true); assert.deepEqual(query.isDeleted, { $ne: true });
  const product = products.find(row => row._id === query._id && row.isActive && !row.isDeleted && row.stock >= query.stock.$gte);
  updates++;
  if (!product) return null;
  product.stock += change.$inc.stock;
  return structuredClone(product);
};
CounterBill.create = async (documents, options) => {
  assert.equal(options.session, session);
  if (createError) throw createError;
  const bill = { ...documents[0], _id: '000000000000000000000099', createdAt: new Date() };
  bills.push(bill); return [structuredClone(bill)];
};
User.findById = id => ({ select: async () => [admin, shopper].includes(String(id)) ? { _id: id, role: String(id) === admin ? 'admin' : 'user' } : null });
beforeEach(() => {
  products = [{ _id: seedId, name: 'Premium seed', nameGu: 'બીજ', unit: 'kg', price: 100, stock: 5, isActive: true }, { _id: feedId, name: 'Feed', unit: 'pack', stock: 1, isActive: true }];
  bills = []; updates = 0; createError = null; transactionError = null;
});
before(async () => {
  process.env.JWT_SECRET = 'counter-stock-test-secret';
  const app = express(); app.use(express.json()); app.use(require('cookie-parser')()); app.use('/bills', require('../routes/counter-bills'));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/bills';
});
after(() => server.close());
const request = (body, user = admin) => fetch(base, { method: 'POST', headers: { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('product IDs are validated and fingerprinted; legacy manual bill fingerprints remain stable', () => {
  const linked = prepareBill(draft()); assert.equal(linked.items[0].product, seedId);
  for (const productId of ['', {}, 'invalid', '0000000000000000000000xx']) assert.throws(() => prepareBill({ ...draft(), items: [{ ...draft().items[0], productId }] }), error => error.status === 400);
  assert.notEqual(linked.requestHash, prepareBill({ ...draft(), items: [{ ...draft().items[0], productId: feedId }] }).requestHash);
  const manual = { ...draft(), items: [{ name: 'Loose seed', qty: 1, price: 100 }] };
  assert.equal(prepareBill(manual).items[0].product, undefined);
  assert.equal(prepareBill(manual).requestHash, prepareBill({ ...manual, items: [{ ...manual.items[0], product: seedId }] }).requestHash);
});
test('linked sale snapshots the real product, permits a manual rate and deducts fractional stock', async () => {
  const result = await saveStockBill(data());
  assert.equal(result.created, true); assert.equal(products[0].stock, 2.875);
  assert.equal(result.bill.items[0].name, 'Premium seed'); assert.equal(result.bill.items[0].unit, 'kg'); assert.equal(result.bill.items[0].nameGu, 'બીજ');
  assert.equal(result.bill.items[0].price, 90.5); assert.equal(products[0].price, 100);
  assert.equal(products[1].stock, 1); assert.equal(bills.length, 1);
});
test('duplicate product lines aggregate before reserving and manual lines never reduce stock', async () => {
  const input = data(); input.items.push({ ...input.items[0], qty: 1.125 }, { name: 'Other service', qty: 1, price: 50 });
  await saveStockBill(input); assert.equal(products[0].stock, 1.75); assert.equal(updates, 1);
});
test('insufficient, hidden and deleted products abort the whole sale without partial deductions', async () => {
  for (const unavailable of [{ stock: 0 }, { isActive: false }, { isDeleted: true }]) {
    Object.assign(products[1], { stock: 1, isActive: true, isDeleted: false }, unavailable);
    const input = data(); input.items.push({ product: feedId, name: 'Feed', qty: 1, price: 20 });
    await assert.rejects(saveStockBill(input), error => error.status === 409);
    assert.equal(products[0].stock, 5); assert.equal(bills.length, 0);
  }
});
test('bill write failure rolls stock back and a failed transaction never falls back to direct writes', async () => {
  createError = Error('write failed'); await assert.rejects(saveStockBill(data()), error => error.status === 503);
  assert.equal(products[0].stock, 5); assert.equal(bills.length, 0);
  transactionError = Error('transactions unavailable'); updates = 0;
  await assert.rejects(saveStockBill(data()), error => error.status === 503); assert.equal(updates, 0);
});
test('simultaneous exact retries save one bill and deduct once, including after catalogue removal', async () => {
  const responses = await Promise.all([request(draft()), request(draft())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.equal(bills.length, 1); assert.equal(products[0].stock, 2.875); assert.equal(updates, 1);
  products[0].isDeleted = true;
  assert.equal((await request(draft())).status, 200); assert.equal(products[0].stock, 2.875);
  assert.equal((await request({ ...draft(), items: [{ ...draft().items[0], price: 1 }] })).status, 409);
});
test('competing sales cannot spend the same stock and out-of-stock API errors are actionable', async () => {
  const first = draft('first-stock-request-123'), second = draft('second-stock-request-123');
  first.items[0].qty = 4; second.items[0].qty = 4;
  const responses = await Promise.all([request(first), request(second)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const conflict = responses.find(response => response.status === 409); assert.match((await conflict.json()).message, /insufficient stock/);
  assert.equal(products[0].stock, 1); assert.equal(bills.length, 1);
});
test('customer accounts cannot deduct inventory through counter billing', async () => {
  assert.equal((await request(draft(), shopper)).status, 403); assert.equal(updates, 0); assert.equal(bills.length, 0);
});

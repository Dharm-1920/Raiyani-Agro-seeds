const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { prepareBill } = require('../services/counter-bills');
const { CounterBill, User } = require('../models');
const delivery = require('../services/invoice-delivery');
const adminId = '000000000000000000000001', customerId = '000000000000000000000002';
const billId = '000000000000000000000003';
const draft = () => ({ requestKey: 'counter-request-12345678', customer: { name: 'Walk-in Farmer', phone: '9876543210', address: 'Gondal' }, items: [{ name: 'Loose seed', qty: '1.125', price: '123.45', unit: 'kg' }, { name: 'Feed', qty: 2, price: '10.10' }], discount: '5.25', paymentMethod: 'cash', paymentStatus: 'paid', invoiceWhatsApp: true, invoiceLanguage: 'en' });

test('counter bill uses manual rates, rounds each line to paise and ignores supplied totals and ownership', () => {
  const bill = prepareBill({ ...draft(), totalAmount: 1, user: customerId, itemsTotal: 1 });
  assert.equal(bill.itemsTotal, 159.08); assert.equal(bill.totalAmount, 153.83);
  assert.equal(bill.items[0].price, 123.45); assert.equal(bill.items[0].qty, 1.125);
  assert.equal(bill.invoicePhone, '+919876543210'); assert.equal(bill.user, undefined);
  assert.equal(bill.shippingFee, 0); assert.equal(bill.source, 'counter');
});
test('counter bills reject invalid money, quantities, phone numbers and excess discounts', () => {
  for (const change of [
    { items: [{ name: 'Seed', qty: 0, price: 20 }] },
    { items: [{ name: 'Seed', qty: -1, price: 20 }] },
    { items: [{ name: 'Seed', qty: 1, price: '1.234' }] },
    { items: [{ name: 'Seed', qty: '1.1234', price: 20 }] },
    { items: [{ name: 'Seed', qty: 1, price: Infinity }] },
    { items: [] }, { discount: 9999 }, { paymentStatus: 'refunded' },
    { customer: { name: 'Farmer', phone: 'invalid' } },
    { customer: { name: 'Farmer' }, invoiceWhatsApp: true },
    { invoiceWhatsApp: 'true' },
  ]) assert.throws(() => prepareBill({ ...draft(), ...change }), error => error.status === 400);
});
test('walk-in bill can be made without a phone or website account when WhatsApp is not requested', async () => {
  const bill = prepareBill({ ...draft(), customer: { name: 'Cash customer' }, invoiceWhatsApp: false });
  const document = new CounterBill({ ...bill, user: adminId });
  await document.validate();
  assert.equal(document.shipping.phone, ''); assert.equal(document.invoiceWhatsApp, false);
});
test('counter bill fingerprints preserve an exact retry and detect edited rates', () => {
  assert.equal(prepareBill(draft()).requestHash, prepareBill(draft()).requestHash);
  const changed = draft(); changed.items[0].price = 500;
  assert.notEqual(prepareBill(draft()).requestHash, prepareBill(changed).requestHash);
});

let server, base, stored, queueOutage = false;
User.findById = id => ({ select: async () => ['000000000000000000000001', customerId].includes(String(id)) ? { _id: id, role: String(id) === adminId ? 'admin' : 'user' } : null });
CounterBill.findOne = async query => stored?.requestKey === query.requestKey ? stored : null;
CounterBill.create = async value => {
  // Simulate a unique database index, including simultaneous requests.
  if (stored) throw Object.assign(new Error('duplicate'), { code: 11000 });
  stored = { ...value, _id: billId, createdAt: new Date('2026-10-29T12:00:00Z') };
  return stored;
};
CounterBill.findById = async id => String(id) === billId ? stored : null;
delivery.queueCounterBill = async () => { if (queueOutage) throw Error('Queue unavailable'); };
before(async () => {
  process.env.JWT_SECRET = 'counter-bill-tests-secret';
  const app = express(); app.use(express.json()); app.use(require('cookie-parser')()); app.use('/api/admin/counter-bills', require('../routes/counter-bills'));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api/admin/counter-bills';
});
after(() => server.close());
const request = (path, user, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(user ? { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET) } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
test('counter billing routes reject guests and customer accounts including PDF and share actions', async () => {
  for (const id of [null, customerId]) {
    const status = id ? 403 : 401;
    assert.equal((await request('', id, draft())).status, status);
    assert.equal((await request('/' + billId + '/invoice', id)).status, status);
    assert.equal((await request('/' + billId + '/share', id, {})).status, status);
  }
});
test('an admin saves a walk-in bill once across simultaneous retries and can download its PDF', async () => {
  stored = null;
  const responses = await Promise.all([request('', adminId, draft()), request('', adminId, draft())]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  for (const response of responses) assert.equal((await response.json())._id, billId);
  assert.equal(stored.user, adminId); assert.equal(stored.totalAmount, 153.83);
  assert.equal((await request('', adminId, { ...draft(), discount: 0 })).status, 409);
  const pdf = await request('/' + billId + '/invoice', adminId);
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('cache-control'), 'private, no-store');
  assert.match(pdf.headers.get('content-disposition'), /^inline/);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  assert.equal((await request('/not-an-id/invoice', adminId)).status, 404);
});
test('WhatsApp queue failure leaves a successful saved sale for retry rather than duplicating it', async () => {
  stored = null; queueOutage = true;
  try {
    assert.equal((await request('', adminId, draft())).status, 201);
    assert.equal(stored.invoiceNoticePending, true);
    assert.equal((await request('', adminId, draft())).status, 200);
  } finally { queueOutage = false; }
});

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
const { User, CounterBill, Expense } = require('../models');
const admin = '000000000000000000000001', customer = '000000000000000000000002', id = '000000000000000000000003';
let bill, expenses, server, base;
User.findById = value => ({ select: async () => [admin, customer].includes(String(value)) ? { _id: value, role: String(value) === admin ? 'admin' : 'user' } : null });
CounterBill.findById = async value => String(value) === id ? structuredClone(bill) : null;
CounterBill.find = () => ({ select: () => ({ lean: async () => [structuredClone(bill)] }) });
CounterBill.findOneAndUpdate = async (query, changes) => { if (String(query._id) !== id || query.__v !== bill.__v) return null; Object.assign(bill, changes.$set); bill.__v++; return structuredClone(bill); };
Expense.find = () => ({ lean: async () => expenses });
Expense.findOne = async query => expenses.find(expense => expense.requestKey === query.requestKey) || null;
Expense.create = async input => { if (expenses.some(expense => expense.requestKey === input.requestKey)) throw Object.assign(Error('duplicate'), { code: 11000 }); const expense = { ...input, _id: '000000000000000000000004' }; expenses.push(expense); return expense; };
before(async () => {
  process.env.JWT_SECRET = 'bookkeeping-routes-test-secret';
  const app = express(); app.use(express.json()); app.use(require('cookie-parser')());
  app.use('/api/admin/bookkeeping', require('../routes/bookkeeping')); app.use('/api/admin/counter-bills', require('../routes/counter-bills'));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/api/admin';
});
beforeEach(() => { expenses = []; bill = { _id: id, user: admin, __v: 0, createdAt: new Date('2026-10-01T10:00:00Z'), totalAmount: 1000, paidCents: 0, payments: [], paymentMethod: 'later', paymentStatus: 'pending', remindersEnabled: true, nextReminderAt: new Date('2026-10-16T10:00:00Z'), shipping: { name: 'Farmer', phone: '+919876543210' } }; });
after(() => server.close());
const request = (path, user, method = 'GET', body) => fetch(base + path, { method, headers: { ...(user ? { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET) } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
test('bookkeeping reports, exports, receipts, expenses and reminder settings are admin-only', async () => {
  for (const user of [null, customer]) {
    for (const [path, method] of [['/bookkeeping', 'GET'], ['/bookkeeping/export', 'GET'], ['/bookkeeping/expenses', 'POST'], [`/counter-bills/${id}/payments`, 'POST'], [`/counter-bills/${id}/reminders`, 'PUT'], [`/counter-bills/${id}/reminder`, 'GET']]) assert.equal((await request(path, user, method, method === 'GET' ? undefined : {})).status, user ? 403 : 401);
  }
});
test('payment API updates the journal and balances; export includes every filtered entry', async () => {
  const receipt = { requestKey: 'api-receipt-123456789', amount: 250, method: 'cash', note: 'First payment' };
  assert.equal((await request(`/counter-bills/${id}/payments`, admin, 'POST', receipt)).status, 200);
  const data = await (await request('/bookkeeping?from=2026-01-01&to=2099-12-31', admin)).json();
  assert.equal(data.summary.salesCents, 100000); assert.equal(data.summary.receiptsCents, 25000); assert.equal(data.summary.outstandingCents, 75000); assert.equal(data.totalEntries, 2);
  const csv = await request('/bookkeeping/export?from=2026-01-01&to=2099-12-31', admin);
  assert.equal(csv.headers.get('cache-control'), 'private, no-store'); assert.match(await csv.text(), /First payment/);
  assert.equal((await request(`/counter-bills/${id}/payments`, admin, 'POST', { ...receipt, requestKey: 'overpayment-12345678', amount: 800 })).status, 409);
});
test('paid expenses are idempotent and a changed entry under the same key is refused', async () => {
  const expense = { requestKey: 'expense-api-123456789', description: 'Shop rent', payee: 'Landlord', category: 'Rent', amount: '500.25', method: 'upi', date: '2026-10-03' };
  const results = await Promise.all([request('/bookkeeping/expenses', admin, 'POST', expense), request('/bookkeeping/expenses', admin, 'POST', expense)]);
  assert.deepEqual(results.map(response => response.status).sort(), [200, 201]); assert.equal(expenses.length, 1);
  assert.equal((await request('/bookkeeping/expenses', admin, 'POST', { ...expense, amount: 600 })).status, 409);
  const report = await (await request('/bookkeeping', admin)).json(); assert.equal(report.summary.expenseCents, 50025);
});
test('manual reminders target the customer and cannot be prepared after full payment', async () => {
  const response = await (await request(`/counter-bills/${id}/reminder`, admin)).json(); assert.ok(response.url.startsWith('https://wa.me/919876543210?text='));
  assert.equal((await request(`/counter-bills/${id}/reminders`, admin, 'PUT', { enabled: false })).status, 200);
  assert.equal((await request(`/counter-bills/${id}/reminder`, admin)).status, 409);
  assert.equal((await request(`/counter-bills/${id}/payments`, admin, 'POST', { requestKey: 'full-payment-api-12345', amount: 1000, method: 'upi' })).status, 200);
  assert.equal((await request(`/counter-bills/${id}/reminders`, admin, 'PUT', { enabled: true })).status, 400);
});

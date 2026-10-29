const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken');
const { User, CounterBill, Expense, JournalEntry } = require('../models');
const admin = '000000000000000000000001', customer = '000000000000000000000002';
let journals, server, base;
User.findById = id => ({ select: async () => [admin, customer].includes(String(id)) ? { _id: id, role: String(id) === admin ? 'admin' : 'user' } : null });
CounterBill.find = () => ({ select: () => ({ lean: async () => [{ _id: 'bill', user: admin, createdAt: '2026-10-01T10:00:00Z', shipping: { name: 'Farmer' }, totalAmount: 1000, paymentStatus: 'paid', paymentMethod: 'cash' }] }) });
Expense.find = () => ({ lean: async () => [{ _id: 'rent', occurredAt: '2026-10-02T10:00:00Z', description: 'Rent', category: 'Rent', amountCents: 20000, method: 'cash' }] });
JournalEntry.find = () => ({ lean: async () => journals });
JournalEntry.findOne = async query => journals.find(entry => entry.requestKey === query.requestKey) || null;
JournalEntry.create = async input => { if (journals.some(entry => entry.requestKey === input.requestKey)) throw Object.assign(Error('duplicate'), { code: 11000 }); const entry = { ...input, _id: 'entry-' + journals.length }; journals.push(entry); return entry; };
before(async () => {
  process.env.JWT_SECRET = 'account-book-route-tests'; const app = express(); app.use(express.json()); app.use(require('cookie-parser')()); app.use('/book', require('../routes/account-book'));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message })); server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/book';
});
after(() => server.close()); beforeEach(() => { journals = [{ _id: 'opening', user: admin, requestKey: 'previous-opening', occurredAt: '2026-09-30T10:00:00Z', description: 'Opening cash', debitAccount: 'Cash', creditAccount: 'Opening balance equity', amountCents: 500000 }]; });
const request = (path, user = admin, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...(user ? { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET) } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
test('account books, exports and manual accounting entries require an administrator', async () => {
  for (const user of [null, customer]) for (const [path, body] of [['', undefined], ['/export', undefined], ['/entries', {}]]) assert.equal((await request(path, user, body)).status, user ? 403 : 401);
});
test('account API includes prior opening entries and produces a dated day book', async () => {
  const response = await request('?account=Cash&from=2026-10-01&to=2026-10-31'), data = await response.json();
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(data.openingCents, 500000); assert.equal(data.debitCents, 100000); assert.equal(data.creditCents, 20000); assert.equal(data.closingCents, 580000); assert.equal(data.totalRows, 2); assert.equal(data.totalDayRows, 3);
  assert.equal((await request('?account=Unknown')).status, 400);
});
test('manual transfers are saved once across concurrent retries and appear in the receiving account', async () => {
  const entry = { requestKey: 'cash-bank-transfer-123', date: '2026-10-03', description: 'Cash bank deposit', debitAccount: 'Bank / UPI', creditAccount: 'Cash', amount: 500 };
  const responses = await Promise.all([request('/entries', admin, entry), request('/entries', admin, entry)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]); assert.equal(journals.length, 2);
  assert.equal((await request('/entries', admin, { ...entry, amount: 600 })).status, 409);
  const bank = await (await request('?account=Bank%20%2F%20UPI&from=2026-10-01&to=2026-10-31')).json(); assert.equal(bank.closingCents, 50000);
  const cash = await (await request('?account=Cash&from=2026-10-01&to=2026-10-31')).json(); assert.equal(cash.closingCents, 530000);
});
test('ledger and day-book CSV exports have complete accounting columns and remain private', async () => {
  const ledger = await request('/export?account=Cash&from=2026-10-01&to=2026-10-31');
  assert.equal(ledger.status, 200); assert.equal(ledger.headers.get('cache-control'), 'private, no-store'); const body = await ledger.text(); assert.match(body, /Opening balance/); assert.match(body, /5800.00 Dr/);
  const day = await (await request('/export?view=day&from=2026-10-01&to=2026-10-31')).text(); assert.match(day, /Debit account/); assert.match(day, /Counter sale/); assert.match(day, /Customer receivables/);
});

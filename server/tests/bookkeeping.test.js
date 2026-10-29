const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CounterBill } = require('../models');
const books = require('../services/bookkeeping');
const { prepareBill } = require('../services/counter-bills');
const id = '000000000000000000000001', admin = '000000000000000000000002';
const now = new Date('2026-10-01T10:00:00Z');
let bill;
const seed = () => ({ _id: id, user: admin, __v: 0, createdAt: now, source: 'counter', totalAmount: 1000, paidCents: 0, payments: [], shipping: { name: 'Farmer', phone: '+919876543210' }, paymentMethod: 'later', paymentStatus: 'pending', remindersEnabled: true, nextReminderAt: new Date(now.valueOf() + books.DAYS_15) });
beforeEach(() => { bill = seed(); });
CounterBill.findById = async value => String(value) === id ? structuredClone(bill) : null;
CounterBill.findOneAndUpdate = async (query, changes) => {
  if (String(query._id) !== id || query.__v !== bill.__v) return null;
  Object.assign(bill, changes.$set); bill.__v += changes.$inc.__v; return structuredClone(bill);
};
const payment = (key, amount, method = 'cash') => ({ requestKey: key, amount, method, note: '' });
test('pay-later bills start unpaid with the first reminder exactly 15 days later', () => {
  const prepared = prepareBill({ requestKey: 'credit-sale-test-1234', customer: { name: 'Farmer', phone: '9876543210' }, items: [{ name: 'Seeds', price: 1000, qty: 1 }], paymentMethod: 'later', paymentStatus: 'pending', remindersEnabled: true });
  const initial = books.initialPayment(prepared, admin, now);
  assert.equal(initial.paidCents, 0); assert.deepEqual(initial.payments, []);
  assert.equal(initial.nextReminderAt.valueOf(), now.valueOf() + 15 * 86400000);
  assert.throws(() => prepareBill({ ...prepared, customer: prepared.shipping, paymentStatus: 'paid' }), /payment method/);
});
test('partial payments reduce the balance without rescheduling reminders; final payment stops reminders', async () => {
  const first = await books.recordPayment(id, payment('first-payment-123456', '250.25'), admin, now);
  assert.equal(first.paymentStatus, 'partial'); assert.equal(first.balanceCents, 74975); assert.equal(first.paidCents, 25025);
  assert.equal(first.nextReminderAt.valueOf(), now.valueOf() + books.DAYS_15);
  const final = await books.recordPayment(id, payment('final-payment-123456', '749.75', 'upi'), admin, now);
  assert.equal(final.balanceCents, 0); assert.equal(final.paymentStatus, 'paid'); assert.equal(final.remindersEnabled, false); assert.equal(final.nextReminderAt, null);
  assert.deepEqual(final.payments.map(row => row.method), ['cash', 'upi']);
});
test('identical concurrent receipt retries create one payment and reject changed reuse', async () => {
  const input = payment('same-payment-12345678', '250');
  await Promise.all([books.recordPayment(id, input, admin, now), books.recordPayment(id, input, admin, now)]);
  assert.equal(bill.payments.length, 1); assert.equal(bill.paidCents, 25000);
  await assert.rejects(books.recordPayment(id, { ...input, amount: 251 }, admin, now), error => error.status === 409);
});
test('competing receipts cannot overpay and invalid decimal or negative amounts are rejected', async () => {
  const results = await Promise.allSettled([books.recordPayment(id, payment('payment-one-12345678', 700), admin), books.recordPayment(id, payment('payment-two-12345678', 700), admin)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(bill.paidCents, 70000);
  for (const amount of [-1, 0, '0.001', Infinity, '1e3']) await assert.rejects(books.recordPayment(id, payment('invalid-pay-12345678', amount), admin), error => error.status === 400);
});
test('legacy paid and unpaid bills retain their balances and initial receipts', () => {
  const paid = { ...seed(), paidCents: undefined, payments: undefined, paymentStatus: 'paid', paymentMethod: 'cash' };
  assert.equal(books.financials(paid).balanceCents, 0); assert.equal(books.paymentsOf(paid)[0].amountCents, 100000);
  assert.equal(books.financials({ ...paid, paymentStatus: 'pending' }).balanceCents, 100000);
});
test('fractional counter prices round line totals in paise before creating the payment balance', () => {
  const prepared = prepareBill({ requestKey: 'rounding-credit-12345', customer: { name: 'Farmer' }, items: [{ name: 'Loose item', price: '1.15', qty: '0.1' }], paymentMethod: 'later', paymentStatus: 'pending' });
  assert.equal(prepared.totalAmount, 0.12); assert.equal(books.financials(prepared).balanceCents, 12);
});
test('journal records sale once, later receipts separately and balanced expense entries', async () => {
  await books.recordPayment(id, payment('part-payment-12345678', 250), admin, new Date('2026-10-20T10:00:00Z'));
  const expense = { _id: 'expense1', description: 'Shop rent', category: 'Rent', amountCents: 10000, method: 'upi', occurredAt: new Date('2026-10-22T10:00:00Z') };
  const report = books.buildBooks([bill], [expense]);
  assert.deepEqual(report.summary, { salesCents: 100000, receiptsCents: 25000, expenseCents: 10000, netMovementCents: 15000, outstandingCents: 75000 });
  assert.equal(report.entries.length, 3); assert.equal(report.entries.filter(entry => entry.kind === 'sale').length, 1);
  assert.equal(report.accounts.reduce((sum, row) => sum + row.debitCents - row.creditCents, 0), 0);
  const later = books.buildBooks([bill], [expense], books.dateRange('2026-10-19', '2026-10-31'));
  assert.equal(later.summary.salesCents, 0); assert.equal(later.summary.receiptsCents, 25000); assert.equal(later.summary.outstandingCents, 75000);
});
test('date filters include the whole India day and reject invalid dates', () => {
  const range = books.dateRange('2026-10-01', '2026-10-01');
  assert.equal(range.start.toISOString(), '2026-09-30T18:30:00.000Z'); assert.equal(range.end.toISOString(), '2026-10-01T18:30:00.000Z');
  assert.throws(() => books.dateRange('2026-02-30', '2026-03-01'), /valid date/);
  assert.throws(() => books.dateRange('2026-10-02', '2026-10-01'), /end date/);
});
test('expense validation and CSV export preserve paise and neutralize spreadsheet formulas', () => {
  const expense = books.prepareExpense({ requestKey: 'expense-request-12345', description: '=1+1', category: 'Rent', amount: '125.25', method: 'cash', date: '2026-10-01' });
  assert.equal(expense.amountCents, 12525);
  const csv = books.booksCsv([{ date: now, reference: 'EX-1', customer: '@formula', description: expense.description, debit: 'Expense: Rent', credit: 'Cash', amountCents: expense.amountCents }]);
  assert.ok(csv.includes('"\'=1+1"')); assert.ok(csv.includes('"\'@formula"')); assert.ok(csv.includes('125.25'));
  assert.throws(() => books.prepareExpense({ requestKey: 'expense-request-12345', description: 'Rent', category: 'Rent', amount: -5, method: 'cash' }), error => error.status === 400);
});

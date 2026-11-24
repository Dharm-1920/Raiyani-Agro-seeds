// Daily register, purchases and supplier books with in-memory model doubles (no MongoDB).
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), jwt = require('jsonwebtoken'), mongoose = require('mongoose');
const models = require('../models');
const { User, CounterBill, Expense, JournalEntry, Purchase, SupplierPayment, DayClose, Order, Product } = models;
const purchases = require('../services/purchases');
const { dailyRegister } = require('../services/daily-register');
const books = require('../services/bookkeeping');
require('../services/notifications').notifyRestockedProduct = async () => {};
const admin = '000000000000000000000001', shopper = '000000000000000000000002', productId = '000000000000000000000020';
const ist = (day, time = '10:00') => new Date(`${day}T${time}:00+05:30`);
const key = n => 'request-key-' + String(n).padStart(8, '0');

test('purchase totals include GST per line and freight; unpaid balance becomes supplier credit', () => {
  const p = purchases.preparePurchase({ requestKey: key(1), supplierName: '  Patel   Agro  ', date: '2026-11-20', otherCharges: '50', paid: '0',
    items: [{ name: 'DAP', qty: '2', rate: '1350', gstPercent: 5 }, { name: 'Cotton seed', qty: '1.5', rate: '864', gstPercent: 0 }] });
  assert.equal(p.subtotalCents, 270000 + 129600); assert.equal(p.taxCents, 13500); assert.equal(p.totalCents, 270000 + 129600 + 13500 + 5000);
  assert.equal(p.paymentMethod, 'credit'); assert.equal(p.supplier.name, 'Patel Agro'); assert.equal(p.supplierKey, 'patel agro');
  assert.equal(p.occurredAt.toISOString(), ist('2026-11-20', '00:00').toISOString()); assert.equal(p.addToStock, false, 'free-text items never touch stock');
});
test('purchase validation refuses overpayment, odd GST rates, missing payment mode and empty bills', () => {
  const base = { requestKey: key(2), supplierName: 'Patel Agro', items: [{ name: 'DAP', qty: 1, rate: 100 }] };
  assert.throws(() => purchases.preparePurchase({ ...base, paid: '101', method: 'cash' }), /more than the bill total/);
  assert.throws(() => purchases.preparePurchase({ ...base, items: [{ name: 'DAP', qty: 1, rate: 100, gstPercent: 7 }] }), /GST rate/);
  assert.throws(() => purchases.preparePurchase({ ...base, paid: '50' }), /cash or by bank/);
  assert.throws(() => purchases.preparePurchase({ ...base, items: [] }), /between 1 and 50/);
  assert.throws(() => purchases.preparePurchase({ ...base, supplierName: ' ' }), /supplier name/);
  assert.throws(() => purchases.preparePurchase({ ...base, gstin: 'ABC' }), /GSTIN/);
});

const day = '2026-11-24';
function sampleBooks() {
  return {
    bills: [
      { _id: 'b1', createdAt: ist(day, '09:30'), totalAmount: 1000, paidCents: 100000, paymentStatus: 'paid', paymentMethod: 'cash', items: [{ name: 'Seeds', qty: 2 }], shipping: { name: 'Farmer A' } },
      { _id: 'b2', createdAt: ist(day, '11:00'), totalAmount: 500, paidCents: 20000, paymentStatus: 'partial', paymentMethod: 'later', shipping: { name: 'Farmer B' },
        payments: [{ requestKey: 'later-1', amountCents: 20000, method: 'upi', receivedAt: ist(day, '16:00') }] },
    ],
    manual: [{ _id: 'j1', occurredAt: ist('2026-11-23', '00:00'), description: 'Opening cash', debitAccount: 'Cash', creditAccount: 'Opening balance equity', amountCents: 200000 }],
    purchases: [{ _id: 'p1', occurredAt: ist(day, '00:00'), createdAt: ist(day, '12:00'), supplier: { name: 'Patel Agro' }, supplierKey: 'patel agro', items: [{ name: 'DAP', qty: 1 }], subtotalCents: 100000, taxCents: 5000, otherChargesCents: 0, totalCents: 105000, paidCents: 50000, paymentMethod: 'cash' }],
    supplierPayments: [{ _id: 's1', occurredAt: ist(day, '00:00'), supplier: { name: 'Patel Agro' }, supplierKey: 'patel agro', amountCents: 30000, method: 'upi' }],
    expenses: [{ _id: 'e1', occurredAt: ist(day, '00:00'), description: 'Tea', category: 'Other', amountCents: 10000, method: 'cash' },
      { _id: 'e2', occurredAt: ist(day, '00:00'), description: 'Typo', category: 'Rent', amountCents: 99900, method: 'cash', voidedAt: new Date(), voidReason: 'Wrong amount' }],
    orders: [{ totalAmount: 440, orderStatus: 'placed' }, { totalAmount: 900, orderStatus: 'cancelled' }],
  };
}
test('daily register balances cash and bank and leaves cancelled entries out of every total', () => {
  const r = dailyRegister(sampleBooks(), books.dateRange(day, day));
  assert.deepEqual(r.cash, { openingCents: 200000, inCents: 100000, outCents: 60000, closingCents: 240000 });
  assert.deepEqual(r.bank, { openingCents: 0, inCents: 20000, outCents: 30000, closingCents: -10000 });
  assert.equal(r.summary.salesCents, 150000); assert.equal(r.summary.receivedCents, 120000); assert.equal(r.summary.creditSalesCents, 50000);
  assert.equal(r.summary.purchasesCents, 105000); assert.equal(r.summary.purchaseTaxCents, 5000); assert.equal(r.summary.supplierPaidCents, 80000);
  assert.equal(r.summary.expensesCents, 10000); assert.equal(r.summary.customerDuesCents, 30000); assert.equal(r.summary.supplierDuesCents, 25000);
  assert.equal(r.summary.websiteOrders, 1); assert.equal(r.summary.websiteCents, 44000);
  const cancelled = r.rows.find(row => row.id === 'expense-e2'); assert.equal(cancelled.voided, true); assert.equal(cancelled.cashCents, 0);
  assert.equal(r.rows.find(row => row.kind === 'purchase').timeKnown, true);
  assert.ok(!r.rows.some(row => row.kind === 'journal'), 'the previous day opening entry is not a row today');
});
test('supplier statement runs a balance and ignores cancelled payments', () => {
  const data = sampleBooks(); data.supplierPayments.push({ _id: 's2', occurredAt: ist(day, '00:00'), supplierKey: 'patel agro', supplier: { name: 'Patel Agro' }, amountCents: 5000, method: 'cash', voidedAt: new Date() });
  const rows = purchases.supplierStatement('patel agro', data.purchases, data.supplierPayments);
  assert.deepEqual(rows.map(row => row.balanceCents), [105000, 55000, 25000, 25000]);
});

let stock, savedPurchases, savedPayments, dayCloses, server, base;
const awaitable = value => Object.assign(Promise.resolve(value), { session: async () => value });
const find = list => () => ({ lean: async () => list, select: () => ({ lean: async () => list }) });
function matches(doc, q) { return Object.entries(q).every(([k, v]) => k === 'voidedAt' && v === null ? !doc.voidedAt : String(doc[k]) === String(v)); }
before(async () => {
  process.env.JWT_SECRET = 'daily-register-test-secret';
  User.findById = id => ({ select: async () => [admin, shopper].includes(String(id)) ? { _id: id, name: 'Owner', role: String(id) === admin ? 'admin' : 'user' } : null });
  CounterBill.find = find([]); Expense.find = find([]); JournalEntry.find = find([]); Order.find = () => ({ select: () => ({ lean: async () => [] }) });
  Purchase.find = () => ({ lean: async () => savedPurchases }); SupplierPayment.find = () => ({ lean: async () => savedPayments });
  Purchase.findOne = q => awaitable(savedPurchases.find(p => matches(p, q)) || null);
  Purchase.findById = id => awaitable(savedPurchases.find(p => p._id === String(id)) || null);
  Purchase.create = async ([doc]) => { if (savedPurchases.some(p => p.requestKey === doc.requestKey)) throw Object.assign(Error('dup'), { code: 11000 }); const p = { ...doc, _id: '0000000000000000000001' + String(savedPurchases.length).padStart(2, '0') }; savedPurchases.push(p); return [p]; };
  Purchase.findOneAndUpdate = async (q, u) => { const p = savedPurchases.find(x => matches(x, q)); if (!p) return null; Object.assign(p, u.$set); return p; };
  SupplierPayment.findOne = async q => savedPayments.find(p => p.requestKey === q.requestKey) || null;
  SupplierPayment.create = async doc => { const p = { ...doc, _id: '0000000000000000000002' + String(savedPayments.length).padStart(2, '0') }; savedPayments.push(p); return p; };
  SupplierPayment.findOneAndUpdate = async (q, u) => { const p = savedPayments.find(x => matches(x, q)); if (!p) return null; Object.assign(p, u.$set); return p; };
  SupplierPayment.findById = async id => savedPayments.find(p => p._id === String(id)) || null;
  Product.findOneAndUpdate = async (q, u) => { if (String(q._id) !== productId || (q.stock && stock < q.stock.$gte)) return null; stock += u.$inc.stock; return { _id: productId, stock }; };
  DayClose.findOne = () => ({ lean: async () => dayCloses[0] || null });
  DayClose.findOneAndUpdate = (q, u) => ({ lean: async () => { dayCloses = [{ date: q.date, ...u.$set }]; return dayCloses[0]; } });
  mongoose.connection.transaction = async fn => fn('session');
  const app = express(); app.use(express.json()); app.use(require('cookie-parser')());
  app.use('/api/admin/daily-register', require('../routes/daily-register'));
  app.use((error, req, res, next) => res.status(500).json({ message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/api/admin/daily-register';
});
after(() => server.close());
beforeEach(() => { stock = 4; savedPurchases = []; savedPayments = []; dayCloses = []; });
const request = (path, user, method = 'GET', body) => fetch(base + path, { method, headers: { ...(user ? { Authorization: 'Bearer ' + jwt.sign({ id: user }, process.env.JWT_SECRET) } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const stockPurchase = { requestKey: key(10), supplierName: 'Patel Agro', date: day, paid: '200', method: 'cash', items: [{ product: productId, name: 'DAP', qty: '3', rate: '100' }, { product: productId, name: 'DAP', qty: '2', rate: '100' }] };

test('register, purchases, supplier payments, cancellations and day close are admin-only', async () => {
  for (const user of [null, shopper]) for (const [path, method] of [['/', 'GET'], ['/export?from=2026-11-01&to=2026-11-30', 'GET'], ['/purchases', 'POST'], ['/supplier-payments', 'POST'], ['/suppliers', 'GET'], ['/day-close', 'PUT'], [`/expenses/${productId}/void`, 'POST']])
    assert.equal((await request(path, user, method, method === 'GET' ? undefined : {})).status, user ? 403 : 401);
});
test('a stock purchase adds every line once, even when retried', async () => {
  const first = await request('/purchases', admin, 'POST', stockPurchase); assert.equal(first.status, 201);
  assert.equal(stock, 9); assert.equal(savedPurchases[0].stockApplied, true);
  assert.equal((await request('/purchases', admin, 'POST', stockPurchase)).status, 200); assert.equal(stock, 9); assert.equal(savedPurchases.length, 1);
  assert.equal((await request('/purchases', admin, 'POST', { ...stockPurchase, paid: '300' })).status, 409, 'changed entry under the same key is refused');
});
test('cancelling a purchase takes its stock back out, but not stock that was already sold', async () => {
  await request('/purchases', admin, 'POST', stockPurchase); const id = savedPurchases[0]._id;
  assert.equal((await request(`/purchases/${id}/void`, admin, 'POST', {})).status, 400, 'a reason is required');
  stock = 2;
  assert.equal((await request(`/purchases/${id}/void`, admin, 'POST', { reason: 'Wrong supplier' })).status, 409); assert.equal(stock, 2); assert.ok(!savedPurchases[0].voidedAt);
  stock = 9;
  assert.equal((await request(`/purchases/${id}/void`, admin, 'POST', { reason: 'Wrong supplier' })).status, 200); assert.equal(stock, 4); assert.equal(savedPurchases[0].voidReason, 'Wrong supplier');
  assert.equal((await request(`/purchases/${id}/void`, admin, 'POST', { reason: 'Again' })).status, 200); assert.equal(stock, 4, 'second cancel is harmless');
});
test('supplier dues follow purchases and payments; the register and CSV show them', async () => {
  await request('/purchases', admin, 'POST', { ...stockPurchase, addToStock: false });
  assert.equal((await request('/supplier-payments', admin, 'POST', { requestKey: key(11), supplierName: 'patel  agro', amount: '100', method: 'upi', date: day })).status, 201);
  const { suppliers, statement } = await (await request('/suppliers?supplier=Patel%20Agro', admin)).json();
  assert.equal(suppliers[0].dueCents, 20000); assert.equal(statement.at(-1).balanceCents, 20000);
  const reg = await (await request('/?date=' + day, admin)).json();
  assert.equal(reg.summary.purchasesCents, 50000); assert.equal(reg.summary.supplierPaidCents, 30000); assert.equal(reg.cash.outCents, 20000); assert.equal(reg.bank.outCents, 10000);
  const csv = await (await request(`/export?from=${day}&to=${day}`, admin)).text(); assert.match(csv, /Supplier payment/); assert.match(csv, /Patel Agro/);
  assert.equal((await request('/export?from=2025-01-01&to=2026-12-31', admin)).status, 400);
});
test('day close stores the counted cash against the expected closing cash', async () => {
  await request('/purchases', admin, 'POST', { ...stockPurchase, addToStock: false });
  const saved = await (await request('/day-close', admin, 'PUT', { date: day, countedCash: '0', note: 'Drawer counted' })).json();
  assert.equal(saved.expectedCashCents, -20000); assert.equal(saved.countedCashCents, 0); assert.equal(saved.closedByName, 'Owner');
  assert.equal((await request('/day-close', admin, 'PUT', { date: day, countedCash: 'abc' })).status, 400);
});

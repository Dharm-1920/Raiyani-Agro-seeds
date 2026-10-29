const crypto = require('crypto');
const { CounterBill } = require('../models');
const { decimal, text, invalid } = require('./counter-bills');
const DAYS_15 = 15 * 86400000;
const accounts = { cash: 'Cash', upi: 'Bank / UPI', card: 'Card clearing' };
const categories = ['Rent', 'Utilities', 'Transport', 'Wages', 'Shop supplies', 'Other'];
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
function key(value) {
  const result = text(value, 80, true);
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(result)) invalid('A valid request key is required.');
  return result;
}
function financials(bill) {
  const totalCents = Math.round(Number(bill.totalAmount || 0) * 100);
  const paidCents = Number.isSafeInteger(bill.paidCents) ? bill.paidCents : bill.paymentStatus === 'paid' ? totalCents : 0;
  return { totalCents, paidCents, balanceCents: Math.max(0, totalCents - paidCents) };
}
function paymentsOf(bill) {
  if (bill.payments?.length) return bill.payments.map(payment => payment.toObject ? payment.toObject() : { ...payment });
  const { paidCents } = financials(bill);
  return paidCents > 0 ? [{ requestKey: 'initial', amountCents: paidCents, method: bill.paymentMethod, receivedAt: bill.createdAt, enteredBy: bill.user, note: 'Initial payment' }] : [];
}
function initialPayment(data, user, now = new Date()) {
  const totalCents = Math.round(data.totalAmount * 100), paid = data.paymentStatus === 'paid' || totalCents === 0;
  return { paidCents: paid ? totalCents : 0, paymentStatus: paid ? 'paid' : 'pending',
    payments: paid && totalCents > 0 ? [{ requestKey: 'initial', amountCents: totalCents, method: data.paymentMethod, receivedAt: now, enteredBy: user, note: 'Initial payment' }] : [],
    remindersEnabled: !paid && data.remindersEnabled === true,
    nextReminderAt: !paid && data.remindersEnabled ? new Date(now.valueOf() + DAYS_15) : null,
  };
}
function publicBill(bill) {
  return { ...(bill.toObject ? bill.toObject() : bill), ...financials(bill), payments: paymentsOf(bill) };
}
async function recordPayment(id, body, user, now = new Date()) {
  const requestKey = key(body.requestKey);
  const amountCents = Math.round(decimal(body.amount, 2, 10000000000000, 'Enter a valid payment amount with up to two decimal places.') * 100);
  if (amountCents <= 0) invalid('Payment amount must be above zero.');
  if (!Object.hasOwn(accounts, body.method)) invalid('Choose cash, UPI or card for the received payment.');
  const note = text(body.note, 250);
  for (let attempt = 0; attempt < 8; attempt++) {
    const bill = await CounterBill.findById(id);
    if (!bill) fail('Bill not found.', 404);
    const previous = paymentsOf(bill);
    const existing = previous.find(payment => payment.requestKey === requestKey);
    if (existing) {
      if (existing.amountCents !== amountCents || existing.method !== body.method || existing.note !== note || String(existing.enteredBy) !== String(user)) fail('This payment request already saved a different receipt.');
      return publicBill(bill);
    }
    const { totalCents, paidCents, balanceCents } = financials(bill);
    if (amountCents > balanceCents) fail('Payment exceeds the remaining balance. Refresh the bill.');
    if (previous.length >= 1000) fail('This bill has reached its payment entry limit.');
    const paid = paidCents + amountCents;
    const updated = await CounterBill.findOneAndUpdate({ _id: id, __v: bill.__v ?? 0 }, { $set: {
      paidCents: paid, paymentStatus: paid === totalCents ? 'paid' : 'partial',
      payments: [...previous, { requestKey, amountCents, method: body.method, receivedAt: now, enteredBy: user, note }],
      ...(paid === totalCents ? { remindersEnabled: false, nextReminderAt: null } : {}),
    }, $inc: { __v: 1 } }, { new: true });
    if (updated) return publicBill(updated);
  }
  fail('Another payment is being saved. Refresh and retry this payment.');
}
function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid('Choose a valid date.');
  const day = new Date(value + 'T00:00:00Z');
  if (Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== value) invalid('Choose a valid date.');
  return new Date(value + 'T00:00:00+05:30');
}
function dateRange(from, to) {
  const start = from ? parseDate(from) : null, last = to ? parseDate(to) : null;
  const end = last ? new Date(last.valueOf() + 86400000) : null;
  if (start && end && start >= end) invalid('The end date must be on or after the start date.');
  return { start, end };
}
function prepareExpense(body, now = new Date()) {
  const data = { description: text(body.description, 250, true), payee: text(body.payee, 120), category: body.category,
    amountCents: Math.round(decimal(body.amount, 2, 10000000000000, 'Enter a valid expense amount.') * 100), method: body.method,
    occurredAt: body.date ? parseDate(body.date) : now,
  };
  if (!categories.includes(data.category) || !['cash', 'upi'].includes(data.method) || data.amountCents <= 0) invalid('Choose an expense category, payment method and amount above zero.');
  // Missing date defaults to the current day in India, stable across retries that day.
  if (!body.date) data.occurredAt = parseDate(new Date(now.valueOf() + 19800000).toISOString().slice(0, 10));
  return { ...data, requestKey: key(body.requestKey), requestHash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}
function buildBooks(bills, expenses, range = {}) {
  const within = date => { const at = new Date(date); return !Number.isNaN(at.valueOf()) && (!range.start || at >= range.start) && (!range.end || at < range.end); };
  const entries = [], dues = [];
  let salesCents = 0, receiptsCents = 0, expenseCents = 0, outstandingCents = 0;
  const posting = (id, date, reference, description, customer, debit, credit, amountCents, kind) => {
    if (amountCents > 0 && within(date)) entries.push({ id, date, reference, description, customer, debit, credit, amountCents, kind });
  };
  for (const bill of bills) {
    const { totalCents, paidCents, balanceCents } = financials(bill), ref = 'CS-' + String(bill._id).toUpperCase();
    if (within(bill.createdAt)) salesCents += totalCents;
    posting('sale-' + bill._id, bill.createdAt, ref, 'Counter sale', bill.shipping?.name || '', 'Customer receivables', 'Counter sales', totalCents, 'sale');
    for (const payment of paymentsOf(bill)) {
      if (within(payment.receivedAt)) receiptsCents += payment.amountCents;
      posting('receipt-' + bill._id + '-' + payment.requestKey, payment.receivedAt, ref, payment.note || 'Customer payment', bill.shipping?.name || '', accounts[payment.method] || 'Cash', 'Customer receivables', payment.amountCents, 'receipt');
    }
    outstandingCents += balanceCents;
    if (balanceCents > 0) dues.push({ id: String(bill._id), reference: ref, customer: bill.shipping?.name || '', phone: bill.shipping?.phone || '', totalCents, paidCents, balanceCents, createdAt: bill.createdAt, remindersEnabled: Boolean(bill.remindersEnabled), nextReminderAt: bill.nextReminderAt });
  }
  for (const expense of expenses) {
    if (within(expense.occurredAt)) expenseCents += expense.amountCents;
    posting('expense-' + expense._id, expense.occurredAt, 'EX-' + String(expense._id).toUpperCase(), expense.description, expense.payee || '', 'Expense: ' + expense.category, accounts[expense.method], expense.amountCents, 'expense');
  }
  entries.sort((a, b) => new Date(b.date) - new Date(a.date) || a.id.localeCompare(b.id));
  dues.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const balances = {};
  for (const entry of entries) { balances[entry.debit] = (balances[entry.debit] || 0) + entry.amountCents; balances[entry.credit] = (balances[entry.credit] || 0) - entry.amountCents; }
  return { summary: { salesCents, receiptsCents, expenseCents, netMovementCents: receiptsCents - expenseCents, outstandingCents }, entries, dues,
    accounts: Object.entries(balances).map(([account, net]) => ({ account, debitCents: Math.max(0, net), creditCents: Math.max(0, -net) })),
  };
}
function booksCsv(entries) {
  const cell = value => { let valueText = String(value ?? ''); if (/^[\s]*[=+\-@]/.test(valueText)) valueText = "'" + valueText; return '"' + valueText.replace(/"/g, '""') + '"'; };
  return '\ufeff' + [['Date (India)', 'Reference', 'Customer / payee', 'Description', 'Debit account', 'Credit account', 'Amount (INR)'], ...entries.map(entry => [new Date(entry.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }), entry.reference, entry.customer, entry.description, entry.debit, entry.credit, (entry.amountCents / 100).toFixed(2)])].map(row => row.map(cell).join(',')).join('\r\n');
}
module.exports = { DAYS_15, accounts, categories, key, financials, paymentsOf, initialPayment, publicBill, recordPayment, dateRange, prepareExpense, buildBooks, booksCsv };

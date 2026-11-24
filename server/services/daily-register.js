const books = require('./bookkeeping');
const account = require('./account-book');
const { supplierBalances } = require('./purchases');
const indiaDay = date => new Date(new Date(date).valueOf() + 19800000).toISOString().slice(0, 10);
const itemSummary = items => (items || []).map(item => `${item.name} × ${Number(item.qty)}`).join(', ');
const effect = (method, cents) => ({ cashCents: method === 'cash' ? cents : 0, bankCents: method === 'upi' ? cents : 0 });
// Date-only entries (purchases, expenses) show the time they were typed in, when that was on the same day.
const when = entry => entry.createdAt && indiaDay(entry.createdAt) === indiaDay(entry.occurredAt) ? { at: entry.createdAt, timeKnown: true } : { at: entry.occurredAt, timeKnown: false };
function registerRows({ bills = [], expenses = [], manual = [], purchases = [], supplierPayments = [], orders = [] }, range) {
  const within = date => { const at = new Date(date); return !Number.isNaN(at.valueOf()) && (!range.start || at >= range.start) && (!range.end || at < range.end); };
  const rows = [];
  for (const bill of bills) {
    const reference = 'CS-' + String(bill._id).toUpperCase(), party = bill.shipping?.name || 'Walk-in customer', payments = books.paymentsOf(bill);
    if (within(bill.createdAt)) {
      const initial = payments.find(payment => payment.requestKey === 'initial'), { totalCents } = books.financials(bill);
      rows.push({ id: 'sale-' + bill._id, kind: 'sale', at: bill.createdAt, timeKnown: true, reference, party, details: itemSummary(bill.items), amountCents: totalCents, settledCents: initial?.amountCents || 0, mode: bill.paymentMethod, billId: String(bill._id), ...effect(initial?.method, initial?.amountCents || 0) });
    }
    for (const payment of payments) if (payment.requestKey !== 'initial' && within(payment.receivedAt)) rows.push({ id: 'receipt-' + bill._id + '-' + payment.requestKey, kind: 'receipt', at: payment.receivedAt, timeKnown: true, reference, party, details: payment.note || 'Customer payment', amountCents: payment.amountCents, settledCents: payment.amountCents, mode: payment.method, billId: String(bill._id), ...effect(payment.method, payment.amountCents) });
  }
  for (const p of purchases) if (within(p.occurredAt)) {
    const live = !p.voidedAt;
    rows.push({ id: 'purchase-' + p._id, entryId: String(p._id), kind: 'purchase', ...when(p), reference: 'PU-' + String(p._id).toUpperCase(), party: p.supplier?.name || '', billNumber: p.billNumber || '', details: itemSummary(p.items), amountCents: p.totalCents, taxCents: p.taxCents || 0, settledCents: p.paidCents || 0, mode: p.paymentMethod, stockApplied: Boolean(p.stockApplied), voided: !live, voidReason: p.voidReason || '', ...effect(live ? p.paymentMethod : '', -(p.paidCents || 0)) });
  }
  for (const s of supplierPayments) if (within(s.occurredAt)) rows.push({ id: 'supplier-payment-' + s._id, entryId: String(s._id), kind: 'supplier-payment', ...when(s), reference: 'SP-' + String(s._id).toUpperCase(), party: s.supplier?.name || '', details: s.note || 'Supplier payment', amountCents: s.amountCents, settledCents: s.amountCents, mode: s.method, voided: Boolean(s.voidedAt), voidReason: s.voidReason || '', ...effect(s.voidedAt ? '' : s.method, -s.amountCents) });
  for (const e of expenses) if (within(e.occurredAt)) rows.push({ id: 'expense-' + e._id, entryId: String(e._id), kind: 'expense', ...when(e), reference: 'EX-' + String(e._id).toUpperCase(), party: e.payee || '', details: e.description + (e.category ? ' · ' + e.category : ''), category: e.category, amountCents: e.amountCents, settledCents: e.amountCents, mode: e.method, voided: Boolean(e.voidedAt), voidReason: e.voidReason || '', ...effect(e.voidedAt ? '' : e.method, -e.amountCents) });
  const orderItems = new Map(orders.map(order => [String(order._id), itemSummary(order.items)]));
  for (const w of account.websiteEntries(orders)) if (within(w.date)) {
    const refund = w.kind === 'website-refund', cents = refund ? -w.amountCents : w.amountCents, method = w.debit === 'Cash' ? 'cash' : 'upi';
    rows.push({ id: w.id, kind: w.kind, at: w.date, timeKnown: true, reference: w.reference, party: w.customer, details: (refund ? 'Refund · ' : '') + (orderItems.get(w.orderId) || 'Website order'), amountCents: w.amountCents, settledCents: w.amountCents, mode: refund ? 'upi' : method, orderId: w.orderId, ...effect(refund ? 'upi' : method, cents) });
  }
  for (const j of manual) if (within(j.occurredAt)) {
    const sign = accountName => (j.debitAccount === accountName ? j.amountCents : 0) - (j.creditAccount === accountName ? j.amountCents : 0);
    rows.push({ id: 'manual-' + j._id, kind: 'journal', ...when(j), reference: 'JE-' + String(j._id).toUpperCase(), party: '', details: `${j.description} · ${j.debitAccount} → ${j.creditAccount}`, amountCents: j.amountCents, settledCents: 0, mode: 'journal', cashCents: sign('Cash'), bankCents: sign('Bank / UPI') });
  }
  return rows.sort((a, b) => new Date(a.at) - new Date(b.at) || a.id.localeCompare(b.id));
}
function dailyRegister(data, range) {
  const entries = account.journalEntries(data.bills || [], data.expenses || [], data.manual || [], data.purchases || [], data.supplierPayments || [], data.orders || []);
  const ledger = name => { const l = account.accountLedger(entries, name, range); return { openingCents: l.openingCents, inCents: l.debitCents, outCents: l.creditCents, closingCents: l.closingCents }; };
  const rows = registerRows(data, range), live = rows.filter(row => !row.voided), sum = (kind, field = 'amountCents') => live.filter(row => row.kind === kind).reduce((total, row) => total + row[field], 0);
  const suppliers = supplierBalances(data.purchases || [], data.supplierPayments || []);
  const summary = {
    salesCents: sum('sale'), salesCount: live.filter(row => row.kind === 'sale').length,
    receivedCents: sum('sale', 'settledCents') + sum('receipt'),
    creditSalesCents: sum('sale') - sum('sale', 'settledCents'),
    purchasesCents: sum('purchase'), purchaseTaxCents: sum('purchase', 'taxCents'), purchasesCount: live.filter(row => row.kind === 'purchase').length,
    supplierPaidCents: sum('purchase', 'settledCents') + sum('supplier-payment'),
    expensesCents: sum('expense'),
    websiteOrders: live.filter(row => row.kind === 'website-sale').length, websiteCents: sum('website-sale') - sum('website-refund'),
    customerDuesCents: (data.bills || []).reduce((total, bill) => total + books.financials(bill).balanceCents, 0),
    supplierDuesCents: suppliers.reduce((total, s) => total + Math.max(0, s.dueCents), 0),
  };
  const expenseByCategory = {};
  for (const row of live) if (row.kind === 'expense') expenseByCategory[row.category || 'Other'] = (expenseByCategory[row.category || 'Other'] || 0) + row.amountCents;
  return { summary, cash: ledger('Cash'), bank: ledger('Bank / UPI'), rows, expenseByCategory, suppliers };
}
const kindLabels = { sale: 'Sale', receipt: 'Customer payment', 'website-sale': 'Website sale', 'website-refund': 'Website refund', purchase: 'Purchase', 'supplier-payment': 'Supplier payment', expense: 'Expense', journal: 'Journal' };
const modeLabels = { cash: 'Cash', upi: 'Bank / UPI', card: 'Card', later: 'Credit', credit: 'Credit', journal: 'Journal' };
function registerCsv(rows) {
  const cell = value => { let s = String(value ?? ''); if (/^\s*[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const rupees = cents => cents ? (cents / 100).toFixed(2) : '';
  const lines = [['Date (India)', 'Time', 'Type', 'Reference', 'Party', 'Supplier bill no.', 'Details', 'Amount (INR)', 'GST (INR)', 'Paid / received now (INR)', 'Mode', 'Cash in / out (INR)', 'Bank in / out (INR)', 'Status'],
    ...rows.map(row => [indiaDay(row.at), row.timeKnown ? new Date(row.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }) : '', kindLabels[row.kind], row.reference, row.party, row.billNumber || '', row.details,
      (row.amountCents / 100).toFixed(2), rupees(row.taxCents), rupees(row.settledCents), modeLabels[row.mode] || row.mode, rupees(row.cashCents), rupees(row.bankCents), row.voided ? 'Cancelled: ' + row.voidReason : 'OK'])];
  return '﻿' + lines.map(row => row.map(cell).join(',')).join('\r\n');
}
module.exports = { indiaDay, registerRows, dailyRegister, registerCsv };

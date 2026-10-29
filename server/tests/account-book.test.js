const { test } = require('node:test');
const assert = require('node:assert/strict');
const book = require('../services/account-book');
const { dateRange } = require('../services/bookkeeping');
const bill = (id, date, amount, payments = []) => ({ _id: id, user: 'admin', createdAt: date, totalAmount: amount, paidCents: payments.reduce((sum, payment) => sum + payment.amountCents, 0), paymentStatus: 'pending', shipping: { name: 'Farmer' }, payments });
test('account ledger carries opening balances and calculates cash debits, credits and running balances', () => {
  const entries = book.journalEntries([], [{ _id: 'expense', description: 'Rent', category: 'Rent', method: 'cash', amountCents: 20000, occurredAt: '2026-10-10T10:00:00Z' }], [
    { _id: 'opening', occurredAt: '2026-09-30T10:00:00Z', description: 'Opening cash', debitAccount: 'Cash', creditAccount: 'Opening balance equity', amountCents: 100000 },
    { _id: 'transfer', occurredAt: '2026-10-05T10:00:00Z', description: 'Cash deposit', debitAccount: 'Bank / UPI', creditAccount: 'Cash', amountCents: 30000 },
  ]);
  const ledger = book.accountLedger(entries, 'Cash', dateRange('2026-10-01', '2026-10-31'));
  assert.equal(ledger.openingCents, 100000); assert.equal(ledger.debitCents, 0); assert.equal(ledger.creditCents, 50000); assert.equal(ledger.closingCents, 50000);
  assert.deepEqual(ledger.rows.map(row => row.balanceCents), [70000, 50000]);
  assert.equal(book.accountLedger(entries, 'Bank / UPI', {}).closingCents, 30000);
});
test('an account with no period transactions retains its brought-forward balance', () => {
  const entries = book.journalEntries([], [], [{ _id: 'old', occurredAt: '2026-09-01T10:00:00Z', description: 'Owner deposit', debitAccount: 'Cash', creditAccount: 'Owner capital', amountCents: 12345 }]);
  const ledger = book.accountLedger(entries, 'Cash', dateRange('2026-10-01', '2026-10-31'));
  assert.equal(ledger.openingCents, 12345); assert.equal(ledger.closingCents, 12345); assert.equal(ledger.rows.length, 0);
});
test('manual entries refuse mismatched accounts, bill accounts and invalid amounts', () => {
  const input = { requestKey: 'manual-entry-test-123', date: '2026-10-01', description: 'Opening', debitAccount: 'Cash', creditAccount: 'Opening balance equity', amount: '1000.25' };
  assert.equal(book.prepareJournal(input).amountCents, 100025);
  for (const change of [{ creditAccount: 'Cash' }, { debitAccount: 'Customer receivables' }, { creditAccount: 'Counter sales' }, { amount: 0 }, { amount: '1.001' }, { date: '2026-02-30' }]) assert.throws(() => book.prepareJournal({ ...input, ...change }), error => error.status === 400);
});
test('customer statements combine repeat visits and receipts with a correct historical opening balance', () => {
  const bills = [bill('first', '2026-09-01T10:00:00Z', 1000, [{ requestKey: 'part', amountCents: 25000, receivedAt: '2026-09-05T10:00:00Z', method: 'cash' }, { requestKey: 'later', amountCents: 50000, receivedAt: '2026-10-10T10:00:00Z', method: 'upi' }]), bill('second', '2026-10-05T10:00:00Z', 500)];
  const statement = book.customerStatement(bills, dateRange('2026-10-01', '2026-10-31'));
  assert.equal(statement.openingCents, 75000); assert.equal(statement.debitCents, 50000); assert.equal(statement.creditCents, 50000); assert.equal(statement.closingCents, 75000); assert.equal(statement.currentDueCents, 75000);
  assert.deepEqual(statement.rows.map(row => row.balanceCents), [125000, 75000]);
});
test('initial customer receipts follow their sale and do not create a temporary negative customer balance', () => {
  const statement = book.customerStatement([bill('cash', '2026-10-01T10:00:01Z', 500, [{ requestKey: 'initial', amountCents: 50000, receivedAt: '2026-10-01T10:00:00Z', method: 'cash' }])]);
  assert.deepEqual(statement.rows.map(row => row.balanceCents), [50000, 0]);
});
test('ledger CSV includes opening, closing and running balances and protects formula-like descriptions', () => {
  const ledger = book.accountLedger(book.journalEntries([], [], [{ _id: 'opening', occurredAt: '2026-10-01T10:00:00Z', description: '=HYPERLINK()', debitAccount: 'Cash', creditAccount: 'Opening balance equity', amountCents: 10025 }]), 'Cash');
  const csv = book.ledgerCsv(ledger);
  assert.ok(csv.includes('Opening balance')); assert.ok(csv.includes('Closing balance')); assert.ok(csv.includes('100.25 Dr')); assert.ok(csv.includes("'=HYPERLINK()"));
});

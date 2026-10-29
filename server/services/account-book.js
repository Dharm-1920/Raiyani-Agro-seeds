const crypto = require('crypto');
const books = require('./bookkeeping');
const { text, decimal, invalid } = require('./counter-bills');
const manualAccounts = ['Cash', 'Bank / UPI', 'Card clearing', 'Owner capital', 'Owner drawings', 'Loan payable', 'Opening balance equity', 'Other income', ...books.categories.map(category => 'Expense: ' + category)];
const allAccounts = [...manualAccounts, 'Customer receivables', 'Counter sales'];
function prepareJournal(body = {}) {
  const data = { occurredAt: books.dateRange(body.date, body.date).start, description: text(body.description, 250, true), debitAccount: body.debitAccount, creditAccount: body.creditAccount,
    amountCents: Math.round(decimal(body.amount, 2, 10000000000000, 'Enter a valid entry amount.') * 100) };
  if (!data.occurredAt || data.amountCents <= 0) invalid('Choose an entry date and an amount above zero.');
  if (!manualAccounts.includes(data.debitAccount) || !manualAccounts.includes(data.creditAccount) || data.debitAccount === data.creditAccount) invalid('Choose two different supported accounts. Customer sales and receipts must be recorded through bills.');
  return { ...data, requestKey: books.key(body.requestKey), requestHash: crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex') };
}
function journalEntries(bills, expenses, manual) {
  return [...books.buildBooks(bills, expenses).entries, ...manual.map(entry => ({
    id: 'manual-' + entry._id, date: entry.occurredAt, reference: 'JE-' + String(entry._id).toUpperCase(), description: entry.description,
    customer: '', debit: entry.debitAccount, credit: entry.creditAccount, amountCents: entry.amountCents, kind: 'manual',
  }))].sort((a, b) => new Date(a.date) - new Date(b.date) || a.id.localeCompare(b.id));
}
function accountLedger(entries, account, range = {}) {
  if (!allAccounts.includes(account)) invalid('Select a valid account.');
  let openingCents = 0, balanceCents = 0, debitCents = 0, creditCents = 0;
  const rows = [];
  for (const entry of entries) {
    const date = new Date(entry.date);
    if (range.end && date >= range.end) continue;
    const debit = entry.debit === account ? entry.amountCents : 0, credit = entry.credit === account ? entry.amountCents : 0;
    if (!debit && !credit) continue;
    balanceCents += debit - credit;
    if (range.start && date < range.start) { openingCents += debit - credit; continue; }
    debitCents += debit; creditCents += credit;
    rows.push({ ...entry, debitCents: debit, creditCents: credit, balanceCents, otherAccount: debit ? entry.credit : entry.debit });
  }
  return { account, openingCents, debitCents, creditCents, closingCents: balanceCents, rows };
}
function customerStatement(bills, range = {}) {
  const entries = [];
  let currentDueCents = 0;
  for (const bill of bills) {
    const ref = 'CS-' + String(bill._id).toUpperCase(), state = books.financials(bill);
    currentDueCents += state.balanceCents;
    entries.push({ id: 'sale-' + bill._id, date: bill.createdAt, reference: ref, billId: String(bill._id), description: 'Counter sale', debitCents: state.totalCents, creditCents: 0, priority: 0 });
    for (const payment of books.paymentsOf(bill)) entries.push({ id: 'receipt-' + bill._id + '-' + payment.requestKey,
      date: payment.requestKey === 'initial' ? bill.createdAt : payment.receivedAt, reference: ref, billId: String(bill._id),
      description: payment.note || 'Customer payment', debitCents: 0, creditCents: payment.amountCents, priority: 1,
    });
  }
  entries.sort((a, b) => new Date(a.date) - new Date(b.date) || a.priority - b.priority || a.id.localeCompare(b.id));
  let openingCents = 0, balanceCents = 0, debitCents = 0, creditCents = 0;
  const rows = [];
  for (const entry of entries) {
    const date = new Date(entry.date);
    if (range.end && date >= range.end) continue;
    balanceCents += entry.debitCents - entry.creditCents;
    if (range.start && date < range.start) { openingCents += entry.debitCents - entry.creditCents; continue; }
    debitCents += entry.debitCents; creditCents += entry.creditCents;
    rows.push({ ...entry, balanceCents });
  }
  return { openingCents, debitCents, creditCents, closingCents: balanceCents, currentDueCents, rows };
}
function ledgerCsv(ledger) {
  const cell = value => { let s = String(value ?? ''); if (/^\s*[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const balance = value => (Math.abs(value) / 100).toFixed(2) + (value < 0 ? ' Cr' : ' Dr');
  const lines = [['Date (India)', 'Reference', 'Description', 'Debit (INR)', 'Credit (INR)', 'Balance (INR)'], ['', '', 'Opening balance', '', '', balance(ledger.openingCents)],
    ...ledger.rows.map(row => [new Date(row.date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }), row.reference, row.description, (row.debitCents / 100).toFixed(2), (row.creditCents / 100).toFixed(2), balance(row.balanceCents)]),
    ['', '', 'Closing balance', '', '', balance(ledger.closingCents)]];
  return '\ufeff' + lines.map(row => row.map(cell).join(',')).join('\r\n');
}
module.exports = { manualAccounts, allAccounts, prepareJournal, journalEntries, accountLedger, customerStatement, ledgerCsv };

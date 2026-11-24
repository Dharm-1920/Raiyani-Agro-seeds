// Final accounts built from the same double-entry journal as the ledgers, so every report agrees with them.
const GROUPS = {
  asset: ['Cash', 'Bank / UPI', 'Card clearing', 'Customer receivables', 'GST input credit'],
  liability: ['Supplier payables', 'Loan payable'],
  equity: ['Owner capital', 'Opening balance equity', 'Owner drawings'],
  income: ['Counter sales', 'Website sales', 'Sales returns', 'Other income'],
  expense: ['Purchases'],
};
const groupOf = account => account.startsWith('Expense: ') ? 'expense' : Object.keys(GROUPS).find(group => GROUPS[group].includes(account)) || 'asset';
const order = account => { const group = groupOf(account), list = GROUPS[group]; const i = list.indexOf(account); return Object.keys(GROUPS).indexOf(group) * 100 + (i < 0 ? 50 : i); };
// Net debit (debits minus credits) per account for entries dated in [start, end).
function balances(entries, start, end) {
  const net = new Map();
  for (const entry of entries) {
    const at = new Date(entry.date);
    if ((start && at < start) || (end && at >= end)) continue;
    net.set(entry.debit, (net.get(entry.debit) || 0) + entry.amountCents);
    net.set(entry.credit, (net.get(entry.credit) || 0) - entry.amountCents);
  }
  return net;
}
const sorted = net => [...net].filter(([, value]) => value !== 0).sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b));
function trialBalance(entries, end) {
  const rows = sorted(balances(entries, null, end)).map(([account, net]) => ({ account, group: groupOf(account), debitCents: Math.max(0, net), creditCents: Math.max(0, -net) }));
  const debitCents = rows.reduce((sum, row) => sum + row.debitCents, 0), creditCents = rows.reduce((sum, row) => sum + row.creditCents, 0);
  return { rows, debitCents, creditCents, balanced: debitCents === creditCents };
}
function profitAndLoss(entries, range) {
  const net = balances(entries, range.start, range.end), credit = account => -(net.get(account) || 0), debit = account => net.get(account) || 0;
  const sales = [['Counter sales', credit('Counter sales')], ['Website sales', credit('Website sales')]].filter(([, value]) => value);
  const grossSalesCents = sales.reduce((sum, [, value]) => sum + value, 0), returnsCents = debit('Sales returns'), netSalesCents = grossSalesCents - returnsCents;
  const purchasesCents = debit('Purchases'), grossProfitCents = netSalesCents - purchasesCents, otherIncomeCents = credit('Other income');
  const expenses = sorted(new Map([...net].filter(([account]) => account.startsWith('Expense: ')))).map(([account, value]) => ({ account, cents: value }));
  const expensesCents = expenses.reduce((sum, row) => sum + row.cents, 0);
  return { sales: sales.map(([account, cents]) => ({ account, cents })), grossSalesCents, returnsCents, netSalesCents, purchasesCents, grossProfitCents, otherIncomeCents, expenses, expensesCents, netProfitCents: grossProfitCents + otherIncomeCents - expensesCents };
}
function balanceSheet(entries, end) {
  const net = balances(entries, null, end), rows = sorted(net);
  const pick = group => rows.filter(([account]) => groupOf(account) === group);
  const assets = pick('asset').map(([account, value]) => ({ account, cents: value }));
  const liabilities = pick('liability').map(([account, value]) => ({ account, cents: -value }));
  const equity = pick('equity').map(([account, value]) => ({ account, cents: -value }));
  // Profit to date is income less expenses across all earlier entries; it belongs to the owner.
  const profitCents = rows.filter(([account]) => ['income', 'expense'].includes(groupOf(account))).reduce((sum, [, value]) => sum - value, 0);
  const total = list => list.reduce((sum, row) => sum + row.cents, 0);
  const assetsCents = total(assets), liabilitiesCents = total(liabilities), equityCents = total(equity) + profitCents;
  return { assets, liabilities, equity, profitCents, assetsCents, liabilitiesCents, equityCents, balanced: assetsCents === liabilitiesCents + equityCents };
}
// Stock is not in the books (purchases are expensed). This values today's stock at each product's latest purchase rate as a guide.
function stockValue(products, purchases) {
  const rates = new Map();
  for (const purchase of [...purchases].filter(p => !p.voidedAt).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt))) for (const item of purchase.items || []) if (item.product) rates.set(String(item.product), item.rateCents);
  let valueCents = 0, valued = 0, unvalued = 0;
  for (const product of products) {
    if (!(product.stock > 0)) continue;
    const rate = rates.get(String(product._id));
    if (rate == null) { unvalued++; continue; }
    valueCents += Math.round(product.stock * rate); valued++;
  }
  return { valueCents, valued, unvalued };
}
function reportsCsv({ profitLoss: pl, balanceSheet: bs, trialBalance: tb }, from, to) {
  const cell = value => '"' + String(value ?? '').replace(/"/g, '""') + '"', rupees = cents => (cents / 100).toFixed(2);
  const lines = [[`Profit & Loss ${from} to ${to}`], ...pl.sales.map(row => [row.account, rupees(row.cents)]), ['Less: Sales returns', rupees(-pl.returnsCents)], ['Net sales', rupees(pl.netSalesCents)], ['Less: Purchases', rupees(-pl.purchasesCents)], ['Gross profit', rupees(pl.grossProfitCents)], ['Other income', rupees(pl.otherIncomeCents)], ...pl.expenses.map(row => ['Less: ' + row.account, rupees(-row.cents)]), ['Net profit', rupees(pl.netProfitCents)], [],
    [`Balance sheet as on ${to}`], ['Assets'], ...bs.assets.map(row => [row.account, rupees(row.cents)]), ['Total assets', rupees(bs.assetsCents)], ['Liabilities'], ...bs.liabilities.map(row => [row.account, rupees(row.cents)]), ['Owner equity'], ...bs.equity.map(row => [row.account, rupees(row.cents)]), ['Profit to date', rupees(bs.profitCents)], ['Total liabilities and equity', rupees(bs.liabilitiesCents + bs.equityCents)], [],
    [`Trial balance as on ${to}`], ['Account', 'Debit', 'Credit'], ...tb.rows.map(row => [row.account, rupees(row.debitCents), rupees(row.creditCents)]), ['Total', rupees(tb.debitCents), rupees(tb.creditCents)]];
  return '﻿' + lines.map(row => row.map(cell).join(',')).join('\r\n');
}
module.exports = { GROUPS, groupOf, balances, trialBalance, profitAndLoss, balanceSheet, stockValue, reportsCsv };

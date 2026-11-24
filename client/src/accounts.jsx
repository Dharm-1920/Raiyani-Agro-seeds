import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { errMsg } from './api';
import { tr, useLanguage } from './language.jsx';
import { money } from './counter-ledger';
import Icon from './icons';
import DailyRegister from './daily-register.jsx';
import CounterBills from './counter-bills.jsx';
import Bookkeeping from './bookkeeping.jsx';
import AccountBook, { downloadBook } from './account-book.jsx';
import './accounts.css';

// The four book-keeping screens live under one Accounts menu. Old links (?tab=Counter bills, ...) still open the right section.
export const LEGACY_SECTIONS = { 'Daily register': 'register', 'Counter bills': 'sales', Bookkeeping: 'dues', 'Account book': 'ledgers' };
const SECTIONS = [
  ['register', 'Day book & register', 'receipt', DailyRegister, 'Daily sales, purchases, expenses, cash and bank.'],
  ['sales', 'Sales bills', 'bag', CounterBills, 'Make, print and share bills for customers at your shop.'],
  ['dues', 'Receipts & dues', 'cash', Bookkeeping, 'Customer balances, payments received and paid expenses.'],
  ['ledgers', 'Ledgers', 'menu', AccountBook, 'Account ledgers, day book, opening balances and adjustments.'],
  ['reports', 'Reports', 'grid', Reports, 'Profit & loss, balance sheet and trial balance.'],
];
const rupees = cents => money((cents || 0) / 100);
const indiaToday = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
function periods() {
  const today = indiaToday(), [y, m] = today.split('-').map(Number), pad = n => String(n).padStart(2, '0');
  const monthEnd = (year, month) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const fyStart = m >= 4 ? y : y - 1, lastMonth = m === 1 ? [y - 1, 12] : [y, m - 1];
  return [
    ['month', 'This month', `${y}-${pad(m)}-01`, today],
    ['last-month', 'Last month', `${lastMonth[0]}-${pad(lastMonth[1])}-01`, monthEnd(lastMonth[0], lastMonth[1])],
    ['fy', 'This financial year', `${fyStart}-04-01`, today],
    ['last-fy', 'Last financial year', `${fyStart - 1}-04-01`, `${fyStart}-03-31`],
  ];
}
const Line = ({ label, cents, strong, minus, note }) => <div className={'report-line' + (strong ? ' is-strong' : '')}><dt>{tr(label)}{note && <small>{tr(note)}</small>}</dt><dd className={cents < 0 ? 'is-negative' : ''}>{minus && cents ? '(' + rupees(cents) + ')' : rupees(cents)}</dd></div>;
function Reports() {
  useLanguage();
  const presets = periods(), [period, setPeriod] = useState('month'), [from, setFrom] = useState(presets[0][2]), [to, setTo] = useState(presets[0][3]);
  const [data, setData] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [view, setView] = useState('pl'), [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    const id = ++sequence.current; setLoading(true); setError('');
    api.get('/admin/account-book/reports', { params: { from, to } }).then(response => { if (id === sequence.current) setData(response.data); })
      .catch(failure => { if (id === sequence.current) setError(errMsg(failure)); }).finally(() => { if (id === sequence.current) setLoading(false); });
    return () => { sequence.current++; };
  }, [from, to]);
  const choose = key => { const preset = presets.find(([k]) => k === key); setPeriod(key); if (preset) { setFrom(preset[2]); setTo(preset[3]); } };
  const exportCsv = async () => { setBusy(true); try { await downloadBook('/admin/account-book/reports/export', { from, to }, `final-accounts-${from}-to-${to}.csv`); } catch (failure) { setError(errMsg(failure)); } finally { setBusy(false); } };
  const pl = data?.profitLoss, bs = data?.balanceSheet, tb = data?.trialBalance;
  const asOn = new Date(to + 'T00:00:00+05:30').toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  return <div className="accounts-reports">
    <section className="admin-panel report-controls"><div className="admin-chips" role="group" aria-label={tr('Report period')}>{presets.map(([key, label]) => <button type="button" key={key} aria-pressed={period === key} onClick={() => choose(key)}>{tr(label)}</button>)}<button type="button" aria-pressed={period === 'custom'} onClick={() => setPeriod('custom')}>{tr('Custom dates')}</button></div>
      {period === 'custom' && <div className="books-filters"><label>{tr('From date')}<input type="date" value={from} max={to} onChange={event => event.target.value && setFrom(event.target.value)} /></label><label>{tr('To date')}<input type="date" value={to} min={from} onChange={event => event.target.value && setTo(event.target.value)} /></label></div>}
      <div className="report-actions"><button type="button" className="secondary" onClick={() => window.print()}><Icon name="receipt" size={16} />{tr('Print')}</button><button type="button" className="secondary" disabled={busy || !data} onClick={exportCsv}><Icon name="download" size={16} />{tr('Export CSV')}</button></div></section>
    {error && <p className="err" role="alert">{tr(error)}</p>}{loading && !data && <p className="admin-empty" role="status">{tr('Preparing your accounts…')}</p>}
    {data && <>
      <div className="report-headline">{[['Net sales', pl.netSalesCents, ''], ['Gross profit', pl.grossProfitCents, ''], [pl.netProfitCents < 0 ? 'Net loss' : 'Net profit', pl.netProfitCents, pl.netProfitCents < 0 ? 'is-loss' : 'is-profit'], ['Cash + bank', (bs.assets.find(a => a.account === 'Cash')?.cents || 0) + (bs.assets.find(a => a.account === 'Bank / UPI')?.cents || 0), '']].map(([label, cents, tone]) => <div key={label} className={tone}><small>{tr(label)}</small><b>{rupees(cents)}</b></div>)}</div>
      <div className="admin-chips report-tabs" role="tablist">{[['pl', 'Profit & Loss'], ['bs', 'Balance sheet'], ['tb', 'Trial balance']].map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={view === key} aria-pressed={view === key} onClick={() => setView(key)}>{tr(label)}</button>)}</div>
      {view === 'pl' && <section className="admin-panel report-sheet"><h3>{tr('Profit & Loss')}<small>{from} → {to}</small></h3><dl>
        {pl.sales.map(row => <Line key={row.account} label={row.account} cents={row.cents} />)}{!pl.sales.length && <Line label="Sales" cents={0} />}
        {pl.returnsCents > 0 && <Line label="Less: Sales returns" cents={pl.returnsCents} minus />}
        <Line label="Net sales" cents={pl.netSalesCents} strong />
        <Line label="Less: Purchases" cents={pl.purchasesCents} minus note="Goods and freight, excluding GST input credit" />
        <Line label="Gross profit" cents={pl.grossProfitCents} strong />
        {pl.otherIncomeCents !== 0 && <Line label="Add: Other income" cents={pl.otherIncomeCents} />}
        {pl.expenses.map(row => <Line key={row.account} label={tr('Less:') + ' ' + tr(row.account)} cents={row.cents} minus />)}
        <Line label={pl.netProfitCents < 0 ? 'Net loss' : 'Net profit'} cents={pl.netProfitCents} strong />
      </dl><p className="muted">{tr('Purchases are counted in full when bought; unsold stock is not deducted. Estimated stock value today')}: <b>{rupees(data.stock.valueCents)}</b>{data.stock.unvalued > 0 && ` (${data.stock.unvalued} ${tr('products have no purchase rate yet')})`}.</p></section>}
      {view === 'bs' && <section className="admin-panel report-sheet report-balance"><h3>{tr('Balance sheet')}<small>{tr('as on')} {asOn}</small></h3><div className="report-columns">
        <dl><div className="report-group">{tr('What the shop owns')}</div>{bs.assets.map(row => <Line key={row.account} label={row.account} cents={row.cents} />)}<Line label="Total assets" cents={bs.assetsCents} strong /></dl>
        <dl><div className="report-group">{tr('What the shop owes')}</div>{bs.liabilities.map(row => <Line key={row.account} label={row.account} cents={row.cents} />)}{!bs.liabilities.length && <Line label="No liabilities" cents={0} />}<div className="report-group">{tr("Owner's capital")}</div>{bs.equity.map(row => <Line key={row.account} label={row.account} cents={row.cents} />)}<Line label={bs.profitCents < 0 ? 'Loss to date' : 'Profit to date'} cents={bs.profitCents} /><Line label="Total liabilities & capital" cents={bs.liabilitiesCents + bs.equityCents} strong /></dl>
      </div><p className={'report-check' + (bs.balanced ? ' is-ok' : '')}><Icon name={bs.balanced ? 'check' : 'help'} size={16} />{tr(bs.balanced ? 'Balanced: assets equal liabilities plus capital.' : 'Not balanced. Please check recent manual entries.')}</p>{!bs.equity.length && <p className="muted">{tr('Tip: add your opening cash and bank balances in Ledgers (Debit Cash, Credit Opening balance equity) so the balance sheet starts from real figures.')}</p>}</section>}
      {view === 'tb' && <section className="admin-panel report-sheet"><h3>{tr('Trial balance')}<small>{tr('as on')} {asOn}</small></h3><table className="report-table"><thead><tr><th>{tr('Account')}</th><th>{tr('Debit')}</th><th>{tr('Credit')}</th></tr></thead><tbody>{tb.rows.map(row => <tr key={row.account}><td>{tr(row.account)}</td><td>{row.debitCents ? rupees(row.debitCents) : ''}</td><td>{row.creditCents ? rupees(row.creditCents) : ''}</td></tr>)}</tbody><tfoot><tr><td>{tr('Total')}</td><td>{rupees(tb.debitCents)}</td><td>{rupees(tb.creditCents)}</td></tr></tfoot></table><p className={'report-check' + (tb.balanced ? ' is-ok' : '')}><Icon name={tb.balanced ? 'check' : 'help'} size={16} />{tr(tb.balanced ? 'Debits equal credits.' : 'Debits and credits differ.')}</p></section>}
    </>}
  </div>;
}
export default function Accounts({ open }) {
  useLanguage();
  const location = useLocation(), nav = useNavigate(), params = new URLSearchParams(location.search);
  const requested = params.get('section') || LEGACY_SECTIONS[params.get('tab')];
  const section = SECTIONS.find(([key]) => key === requested) || SECTIONS[0];
  const [key, , , View] = section, navRef = useRef(null);
  useEffect(() => { navRef.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [key]);
  // Inner screens still call open('Counter bills') etc.; route those to the right section.
  const go = (target, extra = {}) => {
    const sectionKey = target === 'Accounts' ? extra.section : LEGACY_SECTIONS[target];
    if (!sectionKey) return open(target, extra);
    const { section: _ignored, ...rest } = extra;
    nav('/admin?' + new URLSearchParams({ tab: 'Accounts', section: sectionKey, ...rest }));
  };
  return <div className="accounts">
    <nav className="accounts-nav" ref={navRef} aria-label={tr('Accounts sections')}>{SECTIONS.map(([k, label, icon]) => <button type="button" key={k} className={k === key ? 'active' : ''} aria-current={k === key ? 'page' : undefined} onClick={() => go('Accounts', { section: k })}><Icon name={icon} size={17} /><span>{tr(label)}</span></button>)}</nav>
    <p className="accounts-hint">{tr(section[4])}</p>
    <View key={key} open={go} />
  </div>;
}

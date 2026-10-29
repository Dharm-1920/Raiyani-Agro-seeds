import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from './api';
import { tr } from './language.jsx';
import { useAuth } from './context';
import { money, indiaDate } from './counter-ledger';
import './bookkeeping.css';
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const blankExpense = () => ({ requestKey: crypto.randomUUID(), date: today(), description: '', payee: '', category: 'Other', amount: '', method: 'cash' });
export default function Bookkeeping() {
  const { user } = useAuth(), key = 'bookkeeping-expense-' + user.id;
  const [from, setFrom] = useState(today().slice(0, 8) + '01'), [to, setTo] = useState(today()), [page, setPage] = useState(1);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(''), [uncertain, setUncertain] = useState(false), [customer, setCustomer] = useState('');
  const [expense, setExpense] = useState(() => { try { const saved = JSON.parse(sessionStorage.getItem(key)); if (saved?.requestKey) return saved; } catch { /* Start fresh. */ } return blankExpense(); });
  const sequence = useRef(0), saving = useRef(false);
  const load = async () => {
    const id = ++sequence.current; setLoading(true); setData(null); setError('');
    try { const response = await api.get('/admin/bookkeeping', { params: { from, to, page } }); if (id === sequence.current) setData(response.data); }
    catch (failure) { if (id === sequence.current) setError(errMsg(failure)); }
    finally { if (id === sequence.current) setLoading(false); }
  };
  useEffect(() => { load(); return () => { sequence.current++; }; }, [from, to, page]);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(expense)); } catch { /* Request keys still protect this tab's retries. */ } }, [expense, key]);
  const saveExpense = async event => {
    event.preventDefault(); if (saving.current) return;
    saving.current = true; setBusy('expense'); setError(''); setNotice('');
    try { await api.post('/admin/bookkeeping/expenses', expense); setExpense(blankExpense()); setUncertain(false); setNotice('Expense recorded.'); await load(); }
    catch (failure) { setError(errMsg(failure)); if (!failure.response || failure.response.status >= 500) setUncertain(true); }
    finally { saving.current = false; setBusy(''); }
  };
  const download = async () => {
    setBusy('export'); setError('');
    try {
      const response = await api.get('/admin/bookkeeping/export', { params: { from, to }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `counter-bookkeeping-${from}-${to}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (failure) { let message = errMsg(failure); if (failure.response?.data instanceof Blob) { try { message = JSON.parse(await failure.response.data.text()).message || message; } catch { /* Keep the request error. */ } } setError(message); }
    finally { setBusy(''); }
  };
  const change = (field, value) => setExpense(current => ({ ...current, [field]: value }));
  const dues = (data?.dues || []).filter(due => `${due.customer} ${due.phone} ${due.reference}`.toLowerCase().includes(customer.toLowerCase()));
  return <div className="bookkeeping">
    <section className="admin-panel"><div className="admin-section-title"><div><h3>{tr('Your counter sales books')}</h3><p>{tr('Sales, customer receipts and shop expenses. Website orders are not included.')}</p></div><button className="secondary" disabled={Boolean(busy) || loading} onClick={download}>{tr('Export journal CSV')}</button></div><div className="books-filters"><label>{tr('From date')}<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label><label>{tr('To date')}<input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></label><button className="secondary" disabled={loading} onClick={load}>{tr('Refresh books')}</button></div><p className="muted">{tr('Sales and payments are separate entries. Date filters use India time; outstanding balances show the current dues from all dates.')}</p></section>
    {error && <p className="err" role="alert">{tr(error)}</p>}{notice && <p className="counter-notice" role="status">{tr(notice)}</p>}
    {loading && <p role="status">{tr('Loading bookkeeping…')}</p>}
    {data && !loading && <>
      <div className="admin-kpis books-kpis">{[['Counter sales', data.summary.salesCents], ['Payments received', data.summary.receiptsCents], ['Expenses paid', data.summary.expenseCents], ['Receipts less expenses', data.summary.netMovementCents], ['Customer dues — all dates', data.summary.outstandingCents]].map(([label, cents]) => <div key={label}><small>{tr(label)}</small><b>{money(cents / 100)}</b></div>)}</div>
      <section className="admin-panel"><div className="admin-section-title"><h3>{tr('Customer balances')} <span className="mini-badge">{data.dues.length}</span></h3><input type="search" placeholder={tr('Search customer, phone or bill')} aria-label={tr('Search customer balances')} value={customer} onChange={event => setCustomer(event.target.value)} /></div>{dues.length ? <table><thead><tr>{['Customer', 'Bill', 'Received', 'Balance due', 'Next reminder', 'Actions'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody>{dues.map(due => <tr key={due.id}><td>{due.customer}<small>{due.phone}</small></td><td>{due.reference}<small>{indiaDate(due.createdAt)}</small></td><td>{money(due.paidCents / 100)}</td><td><b>{money(due.balanceCents / 100)}</b></td><td>{due.remindersEnabled ? indiaDate(due.nextReminderAt) : tr('Reminders off')}</td><td><Link className="books-open" to={`/admin?tab=Counter%20bills&bill=${due.id}`}>{tr('Record payment / open bill')}</Link></td></tr>)}</tbody></table> : <p className="admin-empty">{tr('No matching customer dues.')}</p>}{!data.remindersConfigured && data.dues.some(due => due.remindersEnabled) && <p className="muted">{tr('Automatic reminders are not connected. Open a bill to prepare a manual WhatsApp reminder.')}</p>}</section>
      <section className="admin-panel"><h3>{tr('Journal entries')}</h3><p className="muted">{tr('Each entry has a matching debit and credit. Receiving a payment clears customer dues and does not create another sale.')}</p>{data.entries.length ? <table><thead><tr>{['Date', 'Reference', 'Customer / payee', 'Description', 'Debit account', 'Credit account', 'Amount'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody>{data.entries.map(entry => <tr key={entry.id}><td>{indiaDate(entry.date)}</td><td>{entry.reference}</td><td>{entry.customer}</td><td>{tr(entry.description)}</td><td>{tr(entry.debit)}</td><td>{tr(entry.credit)}</td><td>{money(entry.amountCents / 100)}</td></tr>)}</tbody></table> : <p className="admin-empty">{tr('No entries for this date range.')}</p>}<div className="counter-pagination"><button className="secondary" disabled={page === 1} onClick={() => setPage(current => current - 1)}>{tr('Previous')}</button><span>{tr('Page')} {page} / {Math.max(1, Math.ceil(data.totalEntries / 50))}</span><button className="secondary" disabled={page * 50 >= data.totalEntries} onClick={() => setPage(current => current + 1)}>{tr('Next')}</button></div></section>
      <details className="admin-panel"><summary>{tr('Account movements for this date range')}</summary><table><thead><tr><th>{tr('Account')}</th><th>{tr('Debit')}</th><th>{tr('Credit')}</th></tr></thead><tbody>{data.accounts.map(account => <tr key={account.account}><td>{tr(account.account)}</td><td>{money(account.debitCents / 100)}</td><td>{money(account.creditCents / 100)}</td></tr>)}</tbody></table><p className="muted">{tr('These are period movements, not opening bank balances, stock valuation or a tax return.')}</p></details>
    </>}
    <form className="admin-panel books-expense" onSubmit={saveExpense}><h3>{tr('Record a paid expense')}</h3><fieldset disabled={Boolean(busy) || uncertain}><div className="formgrid"><label>{tr('Description')}<input required maxLength={250} value={expense.description} onChange={event => change('description', event.target.value)} /></label><label>{tr('Payee (optional)')}<input maxLength={120} value={expense.payee} onChange={event => change('payee', event.target.value)} /></label><label>{tr('Category')}<select value={expense.category} onChange={event => change('category', event.target.value)}>{(data?.categories || ['Rent', 'Utilities', 'Transport', 'Wages', 'Shop supplies', 'Other']).map(category => <option key={category} value={category}>{tr(category)}</option>)}</select></label><label>{tr('Amount paid (₹)')}<input type="number" required min="0.01" step="0.01" value={expense.amount} onChange={event => change('amount', event.target.value)} /></label><label>{tr('Paid from')}<select value={expense.method} onChange={event => change('method', event.target.value)}><option value="cash">{tr('Cash')}</option><option value="upi">{tr('Bank / UPI')}</option></select></label><label>{tr('Expense date')}<input type="date" required value={expense.date} onChange={event => change('date', event.target.value)} /></label></div></fieldset><p className="muted">{tr('Enter expenses only after paying them. This is a basic sales, receipts and expense book; inventory costs and tax calculations are not included.')}</p>{uncertain && <p>{tr('Retry this same expense to confirm it without adding a duplicate.')}</p>}<button disabled={Boolean(busy)}>{tr(uncertain ? 'Retry expense' : 'Save expense')}</button></form>
  </div>;
}

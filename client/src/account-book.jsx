import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from './api';
import { tr } from './language.jsx';
import { useAuth } from './context';
import { money, indiaDate } from './counter-ledger';
import './account-book.css';
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const manualAccounts = ['Cash', 'Bank / UPI', 'Card clearing', 'Owner capital', 'Owner drawings', 'Loan payable', 'Opening balance equity', 'Other income', 'Expense: Rent', 'Expense: Utilities', 'Expense: Transport', 'Expense: Wages', 'Expense: Shop supplies', 'Expense: Other'];
const fresh = () => ({ requestKey: crypto.randomUUID(), date: today(), description: '', amount: '', debitAccount: 'Cash', creditAccount: 'Opening balance equity' });
export const bookBalance = cents => `${money(Math.abs(cents) / 100)} ${cents < 0 ? tr('Cr') : tr('Dr')}`;
export async function downloadBook(url, params, filename) {
  const response = await api.get(url, { params, responseType: 'blob' });
  const href = URL.createObjectURL(response.data), anchor = document.createElement('a'); anchor.href = href; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(href), 2000);
}
export default function AccountBook() {
  const { user } = useAuth(), storageKey = 'account-book-entry-' + user.id;
  const [from, setFrom] = useState(today().slice(0, 8) + '01'), [to, setTo] = useState(today()), [account, setAccount] = useState('Cash'), [view, setView] = useState('ledger'), [page, setPage] = useState(1);
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(''), [uncertain, setUncertain] = useState(false);
  const [entry, setEntry] = useState(() => { try { const saved = JSON.parse(sessionStorage.getItem(storageKey)); if (saved?.requestKey) return saved; } catch { /* Start fresh. */ } return fresh(); });
  const sequence = useRef(0), lock = useRef(false);
  const load = async () => {
    const id = ++sequence.current; setLoading(true); setData(null); setError('');
    try { const response = await api.get('/admin/account-book', { params: { account, from, to, page } }); if (id === sequence.current) setData(response.data); }
    catch (failure) { if (id === sequence.current) setError(errMsg(failure)); }
    finally { if (id === sequence.current) setLoading(false); }
  };
  useEffect(() => { load(); return () => { sequence.current++; }; }, [account, from, to, page]);
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(entry)); } catch { /* The request key still protects this tab. */ } }, [entry, storageKey]);
  const save = async event => {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy('save'); setError(''); setNotice('');
    try { await api.post('/admin/account-book/entries', entry); setEntry(fresh()); setUncertain(false); setNotice('Accounting entry saved.'); await load(); }
    catch (failure) { setError(errMsg(failure)); if (!failure.response || failure.response.status >= 500) setUncertain(true); }
    finally { setBusy(''); lock.current = false; }
  };
  const exportRows = async () => {
    setBusy('export'); setError('');
    try { await downloadBook('/admin/account-book/export', { account, from, to, view }, view === 'day' ? 'day-book.csv' : 'account-ledger.csv'); }
    catch (failure) { setError(errMsg(failure)); } finally { setBusy(''); }
  };
  const change = (key, value) => setEntry(current => ({ ...current, [key]: value }));
  const count = data ? view === 'ledger' ? data.totalRows : data.totalDayRows : 0;
  return <div className="account-book">
    <section className="admin-panel account-book-screen"><div className="admin-section-title"><div><h3>{tr('Account book')}</h3><p>{tr('Open an account ledger or read the dated day book. Bills and payments appear automatically.')}</p></div><div className="book-buttons"><button className="secondary" disabled={loading || Boolean(busy)} onClick={exportRows}>{tr('Export account book')}</button><button className="secondary" disabled={loading || Boolean(busy)} onClick={load}>{tr('Refresh books')}</button></div></div>
      <div className="books-filters"><label>{tr('Book view')}<select value={view} onChange={event => { setView(event.target.value); setPage(1); }}><option value="ledger">{tr('Account ledger')}</option><option value="day">{tr('Day book')}</option></select></label><label>{tr('Account')}<select value={account} disabled={view === 'day'} onChange={event => { setAccount(event.target.value); setPage(1); }}>{(data?.accounts || [...manualAccounts, 'Customer receivables', 'Counter sales']).map(name => <option key={name} value={name}>{tr(name)}</option>)}</select></label><label>{tr('From date')}<input type="date" value={from} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label><label>{tr('To date')}<input type="date" value={to} onChange={event => { setTo(event.target.value); setPage(1); }} /></label></div>
    </section>
    {error && <p className="err" role="alert">{tr(error)}</p>}{notice && <p className="counter-notice" role="status">{tr(notice)}</p>}{loading && <p role="status">{tr('Loading account book…')}</p>}
    {data && <section className="admin-panel account-book-pages"><h3>{tr(view === 'ledger' ? account : 'Day book')}</h3>{view === 'ledger' && <div className="ledger-totals">{[['Opening balance', bookBalance(data.openingCents)], ['Debits', money(data.debitCents / 100)], ['Credits', money(data.creditCents / 100)], ['Closing balance', bookBalance(data.closingCents)]].map(([label, value]) => <div key={label}><small>{tr(label)}</small><strong>{value}</strong></div>)}</div>}
      {view === 'ledger' ? <table className="ledger-table"><thead><tr>{['Date', 'Voucher / bill', 'Particulars', 'Debit', 'Credit', 'Running balance'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody><tr className="ledger-brought-forward"><td colSpan="5">{tr(page === 1 ? 'Opening balance' : 'Balance brought forward')}</td><td>{bookBalance(page === 1 ? data.openingCents : data.rows[0] ? data.rows[0].balanceCents - data.rows[0].debitCents + data.rows[0].creditCents : data.closingCents)}</td></tr>{data.rows.map(row => <tr key={row.id}><td>{indiaDate(row.date)}</td><td>{row.reference}</td><td>{row.description}<small>{tr(row.otherAccount)}</small></td><td>{row.debitCents ? money(row.debitCents / 100) : '—'}</td><td>{row.creditCents ? money(row.creditCents / 100) : '—'}</td><td>{bookBalance(row.balanceCents)}</td></tr>)}{!data.rows.length && <tr><td colSpan="6">{tr('No entries for this date range.')}</td></tr>}</tbody></table>
        : <table className="ledger-table"><thead><tr>{['Date', 'Voucher / bill', 'Particulars', 'Debit account', 'Credit account', 'Amount'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody>{data.dayBook.map(row => <tr key={row.id}><td>{indiaDate(row.date)}</td><td>{row.reference}</td><td>{row.description}<small>{row.customer}</small></td><td>{tr(row.debit)}</td><td>{tr(row.credit)}</td><td>{money(row.amountCents / 100)}</td></tr>)}{!data.dayBook.length && <tr><td colSpan="6">{tr('No entries for this date range.')}</td></tr>}</tbody></table>}
      <div className="counter-pagination account-book-screen"><button className="secondary" disabled={page === 1 || loading} onClick={() => setPage(current => current - 1)}>{tr('Previous')}</button><span>{tr('Page')} {page} / {Math.max(1, Math.ceil(count / 50))}</span><button className="secondary" disabled={page * 50 >= count || loading} onClick={() => setPage(current => current + 1)}>{tr('Next')}</button></div><p className="muted">{tr('Opening balances include earlier recorded entries. These are book balances; they are not a bank reconciliation. Website orders are not included.')}</p>
    </section>}
    <form className="admin-panel account-book-screen" onSubmit={save}><h3>{tr('Add an accounting entry')}</h3><p>{tr('Use this for opening balances, cash/bank transfers, owner funds and other adjustments. Record customer sales and payments through counter bills.')}</p><fieldset disabled={Boolean(busy) || uncertain}><div className="formgrid"><label>{tr('Entry date')}<input type="date" required value={entry.date} onChange={event => change('date', event.target.value)} /></label><label>{tr('Description')}<input required maxLength={250} value={entry.description} onChange={event => change('description', event.target.value)} /></label><label>{tr('Debit account')}<select value={entry.debitAccount} onChange={event => change('debitAccount', event.target.value)}>{(data?.manualAccounts || manualAccounts).map(name => <option key={name} value={name}>{tr(name)}</option>)}</select></label><label>{tr('Credit account')}<select value={entry.creditAccount} onChange={event => change('creditAccount', event.target.value)}>{(data?.manualAccounts || manualAccounts).map(name => <option key={name} value={name}>{tr(name)}</option>)}</select></label><label>{tr('Amount (₹)')}<input type="number" required min="0.01" step="0.01" value={entry.amount} onChange={event => change('amount', event.target.value)} /></label></div></fieldset><p className="muted">{tr('Example: opening cash uses Debit Cash and Credit Opening balance equity. Saved entries are permanent; use a reversing entry to correct a mistake.')}</p>{uncertain && <p>{tr('Retry this same entry to avoid creating a duplicate.')}</p>}<button disabled={Boolean(busy)}>{tr(uncertain ? 'Retry entry' : 'Save accounting entry')}</button></form>
  </div>;
}

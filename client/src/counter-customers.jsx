import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api, { errMsg } from './api';
import { tr } from './language.jsx';
import { useAuth } from './context';
import { money, indiaDate } from './counter-ledger';
import { bookBalance, downloadBook } from './account-book';
import './account-book.css';
const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const fresh = () => ({ requestKey: crypto.randomUUID(), name: '', phone: '', address: '', preferredLanguage: 'en' });
export default function CounterCustomers() {
  const { user } = useAuth(), storageKey = 'counter-customer-draft-' + user.id;
  const location = useLocation(), navigate = useNavigate();
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [list, setList] = useState({ items: [], total: 0, limit: 25 }), [loading, setLoading] = useState(true);
  const [form, setForm] = useState(() => { try { const draft = JSON.parse(sessionStorage.getItem(storageKey)); if (draft?.requestKey) return draft; } catch { /* Start fresh. */ } return fresh(); });
  const [editing, setEditing] = useState(null), [selected, setSelected] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [from, setFrom] = useState(today().slice(0, 8) + '01'), [to, setTo] = useState(today()), [statementPage, setStatementPage] = useState(1), [statement, setStatement] = useState(null), [statementError, setStatementError] = useState(''), [statementLoading, setStatementLoading] = useState(false);
  const listSequence = useRef(0), statementSequence = useRef(0), lock = useRef(false);
  const load = async () => {
    const id = ++listSequence.current; setLoading(true); setError('');
    try { const response = await api.get('/admin/counter-customers', { params: { search, page } }); if (id === listSequence.current) setList(response.data); }
    catch (failure) { if (id === listSequence.current) setError(errMsg(failure)); }
    finally { if (id === listSequence.current) setLoading(false); }
  };
  useEffect(() => { const timer = setTimeout(load, 200); return () => { clearTimeout(timer); listSequence.current++; }; }, [search, page]);
  useEffect(() => { if (!editing) { try { sessionStorage.setItem(storageKey, JSON.stringify(form)); } catch { /* In-memory retries still work. */ } } }, [form, editing, storageKey]);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('customer');
    if (!id) { setSelected(null); return; }
    let active = true;
    api.get('/admin/counter-customers/' + encodeURIComponent(id)).then(({ data }) => { if (active) { setSelected(data); setStatementPage(1); } }).catch(failure => { if (active) setError(errMsg(failure)); });
    return () => { active = false; };
  }, [location.search]);
  useEffect(() => {
    if (!selected?._id) { setStatement(null); return; }
    const id = ++statementSequence.current; setStatement(null); setStatementLoading(true); setStatementError('');
    api.get(`/admin/counter-customers/${selected._id}/statement`, { params: { from, to, page: statementPage } }).then(({ data }) => { if (id === statementSequence.current) setStatement(data); })
      .catch(failure => { if (id === statementSequence.current) setStatementError(errMsg(failure)); }).finally(() => { if (id === statementSequence.current) setStatementLoading(false); });
    return () => { statementSequence.current++; };
  }, [selected?._id, selected?.updatedAt, from, to, statementPage]);
  const open = customer => navigate('/admin?tab=Counter%20customers&customer=' + customer._id);
  const edit = customer => { setEditing(customer._id); setForm({ ...customer, version: customer.__v }); setUncertain(false); setError(''); };
  const reset = () => { setEditing(null); setForm(fresh()); setUncertain(false); setError(''); };
  const save = async event => {
    event.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const response = editing ? await api.put('/admin/counter-customers/' + editing, form) : await api.post('/admin/counter-customers', form);
      setSelected(response.data); open(response.data); reset(); setNotice('Customer saved. Select them next time instead of entering their details again.'); await load();
    } catch (failure) {
      setError(errMsg(failure)); if (!failure.response || failure.response.status >= 500) setUncertain(true);
      if (failure.response?.status === 409 && editing) setUncertain(false);
    } finally { setBusy(false); lock.current = false; }
  };
  const exportStatement = async () => {
    setBusy(true); setStatementError('');
    try { await downloadBook(`/admin/counter-customers/${selected._id}/statement`, { from, to, format: 'csv' }, 'customer-statement.csv'); }
    catch (failure) { setStatementError(errMsg(failure)); } finally { setBusy(false); }
  };
  const change = (field, value) => setForm(current => ({ ...current, [field]: value }));
  return <div className="customer-directory">
    {error && <p className="err" role="alert">{tr(error)}</p>}{notice && <p className="counter-notice" role="status">{tr(notice)}</p>}
    <section className="admin-panel customer-screen-only"><div className="admin-section-title"><div><h3>{tr('Saved counter customers')}</h3><p>{tr('Save details once. Find a returning customer by name or phone, then make their next bill.')}</p></div><button className="secondary" disabled={loading} onClick={load}>{tr('Refresh customers')}</button></div><label>{tr('Search saved customers')}<input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={tr('Name or phone number')} /></label>{loading ? <p role="status">{tr('Loading customers…')}</p> : list.items.length ? <table><thead><tr>{['Customer', 'Phone', 'Address', 'Actions'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody>{list.items.map(customer => <tr key={customer._id}><td><strong>{customer.name}</strong></td><td>{customer.phone || '—'}</td><td>{customer.address || '—'}</td><td><div className="customer-editor-actions"><Link className="books-open" to={`/admin?tab=Counter%20bills&customer=${customer._id}`}>{tr('Make bill')}</Link><button className="link" onClick={() => open(customer)}>{tr('Statement')}</button><button className="link" onClick={() => edit(customer)}>{tr('Edit details')}</button></div></td></tr>)}</tbody></table> : <p className="admin-empty">{tr('No saved customers found.')}</p>}<div className="counter-pagination"><button className="secondary" disabled={page === 1 || loading} onClick={() => setPage(current => current - 1)}>{tr('Previous')}</button><span>{tr('Page')} {page} / {Math.max(1, Math.ceil(list.total / list.limit))}</span><button className="secondary" disabled={page * list.limit >= list.total || loading} onClick={() => setPage(current => current + 1)}>{tr('Next')}</button></div></section>
    <form className="admin-panel customer-editor customer-screen-only" onSubmit={save}><div className="admin-section-title"><h3>{tr(editing ? 'Edit saved customer' : 'Add a customer')}</h3>{editing && <button type="button" className="secondary" onClick={reset}>{tr('Add a different customer')}</button>}</div><fieldset disabled={busy || uncertain}><div className="formgrid"><label>{tr('Customer name')}<input required maxLength={120} value={form.name} onChange={event => change('name', event.target.value)} /></label><label>{tr('Phone')}<input type="tel" maxLength={40} value={form.phone} onChange={event => change('phone', event.target.value)} placeholder="+91" /></label><label>{tr('Address (optional)')}<input maxLength={500} value={form.address} onChange={event => change('address', event.target.value)} /></label><label>{tr('Preferred bill language')}<select value={form.preferredLanguage} onChange={event => change('preferredLanguage', event.target.value)}><option value="en">English</option><option value="gu">ગુજરાતી</option></select></label></div></fieldset><p className="muted">{tr('Changing a profile does not change old bills. WhatsApp permission is chosen separately for each bill.')}</p>{uncertain && <p>{tr('Retry saving the same customer to confirm the result without creating a duplicate.')}</p>}<button disabled={busy}>{tr(uncertain ? 'Retry customer save' : 'Save customer')}</button></form>
    {selected && <section className="admin-panel customer-statement"><div className="admin-section-title"><div><h3>{tr('Customer account statement')}: {selected.name}</h3><p>{selected.phone} · {selected.address}</p></div><div className="book-buttons customer-screen-only"><Link className="books-open" to={`/admin?tab=Counter%20bills&customer=${selected._id}`}>{tr('Make bill')}</Link><button className="secondary" disabled={statementLoading || !statement || busy} onClick={exportStatement}>{tr('Export statement')}</button></div></div><div className="books-filters customer-screen-only"><label>{tr('From date')}<input type="date" value={from} onChange={event => { setFrom(event.target.value); setStatementPage(1); }} /></label><label>{tr('To date')}<input type="date" value={to} onChange={event => { setTo(event.target.value); setStatementPage(1); }} /></label></div>{statementError && <p className="err" role="alert">{tr(statementError)}</p>}{statementLoading && <p role="status">{tr('Loading statement…')}</p>}{statement && <><div className="ledger-totals">{[['Opening balance', bookBalance(statement.openingCents)], ['Closing balance', bookBalance(statement.closingCents)], ['Current dues — all dates', money(statement.currentDueCents / 100)]].map(([label, value]) => <div key={label}><small>{tr(label)}</small><strong>{value}</strong></div>)}</div><table className="ledger-table"><thead><tr>{['Date', 'Voucher / bill', 'Particulars', 'Debit', 'Credit', 'Running balance', 'Actions'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody>{statement.rows.map(row => <tr key={row.id}><td>{indiaDate(row.date)}</td><td>{row.reference}</td><td>{tr(row.description)}</td><td>{row.debitCents ? money(row.debitCents / 100) : '—'}</td><td>{row.creditCents ? money(row.creditCents / 100) : '—'}</td><td>{bookBalance(row.balanceCents)}</td><td><Link className="books-open" to={`/admin?tab=Counter%20bills&bill=${row.billId}`}>{tr('Open bill')}</Link></td></tr>)}{!statement.rows.length && <tr><td colSpan="7">{tr('No entries for this date range.')}</td></tr>}</tbody></table><div className="counter-pagination customer-screen-only"><button className="secondary" disabled={statementPage === 1} onClick={() => setStatementPage(current => current - 1)}>{tr('Previous')}</button><span>{tr('Page')} {statementPage} / {Math.max(1, Math.ceil(statement.totalRows / 50))}</span><button className="secondary" disabled={statementPage * 50 >= statement.totalRows} onClick={() => setStatementPage(current => current + 1)}>{tr('Next')}</button></div><p className="muted">{tr('This statement includes bills linked to this saved customer. Earlier unlinked walk-in bills are not merged by matching names or phone numbers.')}</p></>}</section>}
  </div>;
}

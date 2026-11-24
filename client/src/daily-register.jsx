import { useEffect, useRef, useState } from 'react';
import AdminTable, { BookReference } from './admin-table';
import api, { errMsg } from './api';
import { tr, productText, useLanguage } from './language.jsx';
import { money } from './counter-ledger';
import Icon from './icons';
import './daily-register.css';

const todayIndia = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const shiftDay = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
const rupees = cents => money((cents || 0) / 100);
const signed = cents => cents ? (cents > 0 ? '+' : '−') + rupees(Math.abs(cents)) : '';
const timeOf = row => row.timeKnown ? new Date(row.at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '—';
const KINDS = { sale: 'Sale', receipt: 'Customer payment', purchase: 'Purchase', 'supplier-payment': 'Supplier payment', expense: 'Expense', journal: 'Journal' };
const MODES = { cash: 'Cash', upi: 'Bank / UPI', card: 'Card', later: 'Credit', credit: 'Credit', journal: '—' };
const FILTERS = [['all', 'All entries', () => true], ['sales', 'Sales & receipts', row => ['sale', 'receipt'].includes(row.kind)], ['purchases', 'Purchases', row => row.kind === 'purchase'], ['payments', 'Supplier payments', row => row.kind === 'supplier-payment'], ['expenses', 'Expenses', row => row.kind === 'expense'], ['journal', 'Journal', row => row.kind === 'journal']];
const cents = value => Math.round((Number(value) || 0) * 100);
const blankItem = () => ({ product: '', name: '', unit: '', qty: '', rate: '', gstPercent: 0 });
const blanks = {
  purchase: date => ({ requestKey: crypto.randomUUID(), supplierName: '', supplierPhone: '', gstin: '', billNumber: '', date, items: [blankItem()], otherCharges: '', paid: '', method: 'cash', addToStock: true, note: '' }),
  payment: date => ({ requestKey: crypto.randomUUID(), supplierName: '', supplierPhone: '', amount: '', method: 'cash', date, note: '' }),
  expense: date => ({ requestKey: crypto.randomUUID(), description: '', payee: '', category: 'Other', amount: '', method: 'cash', date }),
};
const urls = { purchase: '/admin/daily-register/purchases', payment: '/admin/daily-register/supplier-payments', expense: '/admin/bookkeeping/expenses' };
async function blobError(failure) {
  let message = errMsg(failure);
  if (failure.response?.data instanceof Blob) { try { message = JSON.parse(await failure.response.data.text()).message || message; } catch { /* Keep the request error. */ } }
  return message;
}
// One entry form: keeps the same request key on uncertain failures so a retry never saves twice.
function useEntry(kind, date, onSaved) {
  const [form, setForm] = useState(() => blanks[kind](date)), [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const touched = useRef(false);
  useEffect(() => { if (!touched.current) setForm(current => ({ ...current, date })); }, [date]);
  const set = (field, value) => { touched.current = true; setForm(current => ({ ...current, [field]: value })); };
  const submit = async (event, body, message) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try { await api.post(urls[kind], body); touched.current = false; setForm(blanks[kind](date)); setUncertain(false); onSaved(message); }
    catch (failure) { setError(errMsg(failure)); if (!failure.response || failure.response.status >= 500) setUncertain(true); }
    finally { setBusy(false); }
  };
  return { form, setForm: next => { touched.current = true; setForm(next); }, set, submit, busy, error, uncertain };
}
function SupplierField({ entry, suppliers }) {
  const known = suppliers.find(s => s.name.toLowerCase() === entry.form.supplierName.trim().toLowerCase().replace(/\s+/g, ' '));
  return <><label>{tr('Supplier name')}<input required maxLength={120} list="register-suppliers" value={entry.form.supplierName} onChange={event => { const name = event.target.value, match = suppliers.find(s => s.name === name); entry.setForm({ ...entry.form, supplierName: name, ...(match?.phone && !entry.form.supplierPhone ? { supplierPhone: match.phone } : {}) }); }} />{known && <small className={'register-due' + (known.dueCents > 0 ? ' is-due' : '')}>{tr('Current due')}: {rupees(known.dueCents)}</small>}</label><label>{tr('Supplier phone (optional)')}<input type="tel" maxLength={20} value={entry.form.supplierPhone} onChange={event => entry.set('supplierPhone', event.target.value)} /></label></>;
}
function Uncertain({ entry, label }) {
  return <>{entry.error && <p className="err" role="alert">{tr(entry.error)}</p>}{entry.uncertain && <p className="register-retry">{tr('Retry this same entry to confirm it without adding a duplicate.')}</p>}<button disabled={entry.busy}>{tr(entry.busy ? 'Saving…' : entry.uncertain ? 'Retry entry' : label)}</button></>;
}
function PurchaseForm({ entry, products, suppliers, gstRates }) {
  const { form } = entry;
  const lines = form.items.map(item => { const amount = cents((Number(item.qty) || 0) * (Number(item.rate) || 0)); return { amount, tax: Math.round(amount * Number(item.gstPercent || 0) / 100) }; });
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0), tax = lines.reduce((sum, line) => sum + line.tax, 0), total = subtotal + tax + cents(form.otherCharges);
  const credit = Math.max(0, total - cents(form.paid)), linked = form.items.some(item => item.product);
  const setItem = (index, changes) => entry.set('items', form.items.map((item, i) => i === index ? { ...item, ...changes } : item));
  const pick = (index, id) => { const p = products.find(product => product._id === id); setItem(index, p ? { product: id, name: p.name, unit: p.unit || '' } : { product: '', name: '' }); };
  const body = { ...form, addToStock: linked && form.addToStock };
  return <form className="register-form" onSubmit={event => entry.submit(event, body, linked && form.addToStock ? 'Purchase saved and stock added.' : 'Purchase saved.')}>
    <fieldset disabled={entry.busy}><div className="formgrid register-grid"><SupplierField entry={entry} suppliers={suppliers} /><label>{tr('Supplier bill no.')}<input maxLength={40} value={form.billNumber} onChange={event => entry.set('billNumber', event.target.value)} /></label><label>{tr('Bill date')}<input type="date" required max={todayIndia()} value={form.date} onChange={event => entry.set('date', event.target.value)} /></label></div>
      <div className="register-items" role="group" aria-label={tr('Purchase items')}>
        <div className="register-item register-item-head" aria-hidden="true"><span>{tr('Item')}</span><span>{tr('Quantity')}</span><span>{tr('Rate (₹)')}</span><span>{tr('GST')}</span><span>{tr('Amount')}</span><span /></div>
        {form.items.map((item, index) => <div className="register-item" key={index}>
          <span className="register-item-name"><select aria-label={tr('Item')} value={item.product} onChange={event => pick(index, event.target.value)}><option value="">{tr('Other item (not in stock list)')}</option>{products.map(p => <option key={p._id} value={p._id}>{productText(p)} · {productText(p, 'unit')}</option>)}</select>{!item.product && <input required aria-label={tr('Item name')} placeholder={tr('Item name')} maxLength={120} value={item.name} onChange={event => setItem(index, { name: event.target.value })} />}</span>
          <span className="register-qty"><input type="number" required min="0.001" step="0.001" aria-label={tr('Quantity')} placeholder={tr('Quantity')} value={item.qty} onChange={event => setItem(index, { qty: event.target.value })} /><input aria-label={tr('Unit')} placeholder={tr('Unit')} maxLength={30} value={item.unit} onChange={event => setItem(index, { unit: event.target.value })} /></span>
          <input type="number" required min="0" step="0.01" aria-label={tr('Rate (₹)')} placeholder={tr('Rate (₹)')} value={item.rate} onChange={event => setItem(index, { rate: event.target.value })} />
          <select aria-label={tr('GST')} value={item.gstPercent} onChange={event => setItem(index, { gstPercent: Number(event.target.value) })}>{gstRates.map(rate => <option key={rate} value={rate}>{rate}%</option>)}</select>
          <b className="register-line-total">{rupees(lines[index].amount + lines[index].tax)}</b>
          <button type="button" className="link danger" aria-label={tr('Remove item')} disabled={form.items.length === 1} onClick={() => entry.set('items', form.items.filter((_, i) => i !== index))}><Icon name="close" size={16} /></button>
        </div>)}
        <button type="button" className="secondary register-add-line" disabled={form.items.length >= 50} onClick={() => entry.set('items', [...form.items, blankItem()])}>{tr('+ Add another item')}</button>
      </div>
      <div className="register-totals"><div className="formgrid register-grid"><label>{tr('Freight / other charges (₹)')}<input type="number" min="0" step="0.01" value={form.otherCharges} onChange={event => entry.set('otherCharges', event.target.value)} /></label><label>{tr('Paid now (₹)')}<span className="register-inline"><input type="number" min="0" step="0.01" max={total / 100} value={form.paid} onChange={event => entry.set('paid', event.target.value)} /><button type="button" className="secondary" disabled={!total} onClick={() => entry.set('paid', (total / 100).toFixed(2))}>{tr('Paid in full')}</button></span></label><label>{tr('Paid from')}<select value={form.method} onChange={event => entry.set('method', event.target.value)}><option value="cash">{tr('Cash')}</option><option value="upi">{tr('Bank / UPI')}</option></select></label></div>
        <dl className="register-bill-total"><div><dt>{tr('Taxable value')}</dt><dd>{rupees(subtotal)}</dd></div><div><dt>{tr('GST')}</dt><dd>{rupees(tax)}</dd></div><div><dt>{tr('Freight / other')}</dt><dd>{rupees(cents(form.otherCharges))}</dd></div><div className="is-total"><dt>{tr('Bill total')}</dt><dd>{rupees(total)}</dd></div><div className={credit ? 'is-credit' : ''}><dt>{tr('On credit (supplier due)')}</dt><dd>{rupees(credit)}</dd></div></dl></div>
      <details className="register-more"><summary>{tr('GSTIN and note (optional)')}</summary><div className="formgrid register-grid"><label>{tr('Supplier GSTIN')}<input maxLength={15} value={form.gstin} onChange={event => entry.set('gstin', event.target.value.toUpperCase())} /></label><label>{tr('Note')}<input maxLength={250} value={form.note} onChange={event => entry.set('note', event.target.value)} /></label></div></details>
      {linked && <label className="register-check"><input type="checkbox" checked={form.addToStock} onChange={event => entry.set('addToStock', event.target.checked)} />{tr('Add these quantities to shop stock')}</label>}
    </fieldset><Uncertain entry={entry} label="Save purchase" /></form>;
}
function PaymentForm({ entry, suppliers }) {
  const known = suppliers.find(s => s.name.toLowerCase() === entry.form.supplierName.trim().toLowerCase().replace(/\s+/g, ' '));
  return <form className="register-form" onSubmit={event => entry.submit(event, entry.form, 'Supplier payment saved.')}><fieldset disabled={entry.busy}><div className="formgrid register-grid"><SupplierField entry={entry} suppliers={suppliers} /><label>{tr('Amount paid (₹)')}<span className="register-inline"><input type="number" required min="0.01" step="0.01" value={entry.form.amount} onChange={event => entry.set('amount', event.target.value)} />{known?.dueCents > 0 && <button type="button" className="secondary" onClick={() => entry.set('amount', (known.dueCents / 100).toFixed(2))}>{tr('Pay full due')}</button>}</span></label><label>{tr('Paid from')}<select value={entry.form.method} onChange={event => entry.set('method', event.target.value)}><option value="cash">{tr('Cash')}</option><option value="upi">{tr('Bank / UPI')}</option></select></label><label>{tr('Payment date')}<input type="date" required max={todayIndia()} value={entry.form.date} onChange={event => entry.set('date', event.target.value)} /></label><label>{tr('Note (optional)')}<input maxLength={250} placeholder={tr('e.g. UPI ref or cheque no.')} value={entry.form.note} onChange={event => entry.set('note', event.target.value)} /></label></div></fieldset><Uncertain entry={entry} label="Save payment" /></form>;
}
function ExpenseForm({ entry, categories }) {
  return <form className="register-form" onSubmit={event => entry.submit(event, entry.form, 'Expense saved.')}><fieldset disabled={entry.busy}><div className="formgrid register-grid"><label>{tr('Description')}<input required maxLength={250} value={entry.form.description} onChange={event => entry.set('description', event.target.value)} /></label><label>{tr('Category')}<select value={entry.form.category} onChange={event => entry.set('category', event.target.value)}>{categories.map(category => <option key={category} value={category}>{tr(category)}</option>)}</select></label><label>{tr('Amount paid (₹)')}<input type="number" required min="0.01" step="0.01" value={entry.form.amount} onChange={event => entry.set('amount', event.target.value)} /></label><label>{tr('Paid from')}<select value={entry.form.method} onChange={event => entry.set('method', event.target.value)}><option value="cash">{tr('Cash')}</option><option value="upi">{tr('Bank / UPI')}</option></select></label><label>{tr('Payee (optional)')}<input maxLength={120} value={entry.form.payee} onChange={event => entry.set('payee', event.target.value)} /></label><label>{tr('Expense date')}<input type="date" required max={todayIndia()} value={entry.form.date} onChange={event => entry.set('date', event.target.value)} /></label></div></fieldset><Uncertain entry={entry} label="Save expense" /></form>;
}
function CashCard({ title, icon, book }) {
  return <div className="register-cash"><h4><Icon name={icon} size={18} />{tr(title)}</h4><dl><div><dt>{tr('Opening')}</dt><dd>{rupees(book.openingCents)}</dd></div><div className="is-in"><dt>{tr('Money in')}</dt><dd>+{rupees(book.inCents)}</dd></div><div className="is-out"><dt>{tr('Money out')}</dt><dd>−{rupees(book.outCents)}</dd></div><div className="is-total"><dt>{tr('Closing')}</dt><dd className={book.closingCents < 0 ? 'is-negative' : ''}>{rupees(book.closingCents)}</dd></div></dl></div>;
}
function DayClose({ date, data, onSaved }) {
  const close = data.dayClose, [counted, setCounted] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [editing, setEditing] = useState(false);
  const expected = data.cash.closingCents, difference = close ? close.countedCashCents - close.expectedCashCents : cents(counted) - expected;
  const verdict = diff => diff === 0 ? 'Cash matches the books.' : diff < 0 ? 'Cash is short by' : 'Extra cash of';
  const save = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.put('/admin/daily-register/day-close', { date, countedCash: counted, note }); setEditing(false); setCounted(''); setNote(''); onSaved('Day closed. Cash count saved.'); }
    catch (failure) { setError(errMsg(failure)); } finally { setBusy(false); }
  };
  if (close && !editing) {
    const changed = close.expectedCashCents !== expected;
    return <div className={'register-close is-closed' + (difference ? ' has-difference' : '')}><h4><Icon name="check" size={18} />{tr('Day closed')}</h4><p>{tr('Counted')} <b>{rupees(close.countedCashCents)}</b> · {tr('Expected')} {rupees(close.expectedCashCents)}</p><p className="register-verdict">{tr(verdict(difference))}{difference ? ' ' + rupees(Math.abs(difference)) : ''}</p>{close.note && <p className="muted">{close.note}</p>}<small>{close.closedByName} · {new Date(close.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })}</small>{changed && <p className="register-warning">{tr('Entries changed after closing. Expected cash is now')} {rupees(expected)}.</p>}<button type="button" className="secondary" onClick={() => setEditing(true)}>{tr('Count again')}</button></div>;
  }
  return <form className="register-close" onSubmit={save}><h4><Icon name="cash" size={18} />{tr('Close the day')}</h4><p className="muted">{tr('Count the cash in the drawer and enter it. The difference is recorded.')}</p><label>{tr('Cash counted (₹)')}<input type="number" required min="0" step="0.01" value={counted} onChange={event => setCounted(event.target.value)} /></label>{counted !== '' && <p className="register-verdict">{tr(verdict(difference))}{difference ? ' ' + rupees(Math.abs(difference)) : ''}</p>}<label>{tr('Note (optional)')}<input maxLength={250} value={note} onChange={event => setNote(event.target.value)} /></label>{error && <p className="err" role="alert">{tr(error)}</p>}<button disabled={busy}>{tr(busy ? 'Saving…' : 'Close day')}</button>{editing && <button type="button" className="link" onClick={() => setEditing(false)}>{tr('Cancel')}</button>}</form>;
}
function Suppliers({ suppliers, onPay }) {
  const [open, setOpen] = useState(''), [statement, setStatement] = useState(null), [error, setError] = useState('');
  const show = async name => {
    if (open === name) { setOpen(''); return; }
    setOpen(name); setStatement(null); setError('');
    try { setStatement((await api.get('/admin/daily-register/suppliers', { params: { supplier: name } })).data.statement); } catch (failure) { setError(errMsg(failure)); }
  };
  const due = suppliers.filter(s => s.dueCents !== 0);
  return <section className="admin-panel"><div className="admin-section-title"><h3>{tr('Supplier dues')} <span className="mini-badge">{due.length}</span></h3><span className="register-total-due">{tr('Total due')}: <b>{rupees(due.reduce((sum, s) => sum + Math.max(0, s.dueCents), 0))}</b></span></div>
    {due.length ? <AdminTable label="Supplier dues" mobileCards numericColumns={[2, 3, 4]} minWidth={760}><thead><tr><th>{tr('Supplier')}</th><th>{tr('Bills')}</th><th>{tr('Billed')}</th><th>{tr('Paid')}</th><th>{tr('Due')}</th><th>{tr('Actions')}</th></tr></thead><tbody>{due.map(s => <tr key={s.key}><td><b>{s.name}</b><small>{s.phone}</small></td><td>{s.bills}</td><td>{rupees(s.billedCents)}</td><td>{rupees(s.paidCents)}</td><td><b className={s.dueCents > 0 ? 'register-owed' : ''}>{rupees(s.dueCents)}</b>{s.dueCents < 0 && <small>{tr('Advance paid')}</small>}</td><td><div className="admin-row-actions"><button type="button" className="link" onClick={() => show(s.name)}>{tr(open === s.name ? 'Hide statement' : 'Statement')}</button>{s.dueCents > 0 && <button type="button" className="link" onClick={() => onPay(s)}>{tr('Pay')}</button>}</div></td></tr>)}</tbody></AdminTable> : <p className="admin-empty">{tr('No supplier dues. Purchases on credit will appear here.')}</p>}
    {open && <div className="register-statement"><h4>{tr('Statement')}: {open}</h4>{error && <p className="err">{tr(error)}</p>}{!statement && !error && <p role="status">{tr('Loading…')}</p>}{statement && <AdminTable label="Supplier statement" numericColumns={[3, 4, 5]} minWidth={700}><thead><tr><th>{tr('Date')}</th><th>{tr('Reference')}</th><th>{tr('Details')}</th><th>{tr('Bill')}</th><th>{tr('Paid')}</th><th>{tr('Balance')}</th></tr></thead><tbody>{statement.map(row => <tr key={row.id} className={row.voided ? 'is-voided' : ''}><td>{new Date(row.date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td><BookReference value={row.reference} /></td><td>{tr(row.description)}{row.voided && <small>{tr('Cancelled')}</small>}</td><td>{row.billCents ? rupees(row.billCents) : ''}</td><td>{row.paidCents ? rupees(row.paidCents) : ''}</td><td>{rupees(row.balanceCents)}</td></tr>)}</tbody></AdminTable>}</div>}
  </section>;
}
export default function DailyRegister({ open }) {
  const { language } = useLanguage();
  const [date, setDate] = useState(todayIndia()), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [tab, setTab] = useState('purchase'), [filter, setFilter] = useState('all'), [products, setProducts] = useState([]), [busy, setBusy] = useState('');
  const sequence = useRef(0), entryRef = useRef(null);
  const load = async () => {
    const id = ++sequence.current; setLoading(true); setError('');
    try { const response = await api.get('/admin/daily-register', { params: { date } }); if (id === sequence.current) setData(response.data); }
    catch (failure) { if (id === sequence.current) setError(errMsg(failure)); }
    finally { if (id === sequence.current) setLoading(false); }
  };
  useEffect(() => { load(); return () => { sequence.current++; }; }, [date]);
  useEffect(() => { api.get('/products', { params: { all: 1, limit: 100 } }).then(response => setProducts(response.data.items)).catch(() => {}); }, []);
  const saved = message => { setNotice(message); load(); };
  const entries = { purchase: useEntry('purchase', date, saved), payment: useEntry('payment', date, saved), expense: useEntry('expense', date, saved) };
  const cancel = async row => {
    const reason = prompt(tr('Why are you cancelling this entry? It stays in the register, marked cancelled.'));
    if (!reason?.trim()) return;
    setBusy(row.id); setError(''); setNotice('');
    const path = { purchase: 'purchases', 'supplier-payment': 'supplier-payments', expense: 'expenses' }[row.kind];
    try { await api.post(`/admin/daily-register/${path}/${row.entryId}/void`, { reason }); saved(row.kind === 'purchase' && row.stockApplied ? 'Entry cancelled and its stock removed.' : 'Entry cancelled.'); }
    catch (failure) { setError(errMsg(failure)); } finally { setBusy(''); }
  };
  const exportMonth = async () => {
    setBusy('export'); setError('');
    const from = date.slice(0, 8) + '01', last = shiftDay(shiftDay(from, 32).slice(0, 8) + '01', -1), to = last > todayIndia() ? todayIndia() : last;
    try {
      const response = await api.get('/admin/daily-register/export', { params: { from, to }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data), anchor = document.createElement('a');
      anchor.href = url; anchor.download = `daily-register-${from}-to-${to}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (failure) { setError(await blobError(failure)); } finally { setBusy(''); }
  };
  const paySupplier = supplier => { entries.payment.setForm({ ...entries.payment.form, supplierName: supplier.name, supplierPhone: supplier.phone || '', amount: (supplier.dueCents / 100).toFixed(2) }); setTab('payment'); entryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const today = todayIndia(), s = data?.summary, rows = data?.rows || [];
  const shown = rows.filter(FILTERS.find(([key]) => key === filter)[2]);
  const heading = new Date(date + 'T00:00:00+05:30').toLocaleDateString(language === 'gu' ? 'gu-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return <div className="daily-register">
    <datalist id="register-suppliers">{(data?.suppliers || []).map(supplier => <option key={supplier.key} value={supplier.name} />)}</datalist>
    <section className="admin-panel register-head">
      <div className="register-date"><button type="button" className="secondary" aria-label={tr('Previous day')} onClick={() => setDate(shiftDay(date, -1))}>‹</button><input type="date" aria-label={tr('Register date')} max={today} value={date} onChange={event => event.target.value && setDate(event.target.value)} /><button type="button" className="secondary" aria-label={tr('Next day')} disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}>›</button>{date !== today && <button type="button" className="link" onClick={() => setDate(today)}>{tr('Today')}</button>}</div>
      <div className="register-title"><span className="eyebrow">{tr('DAILY REGISTER')}</span><h2>{heading}</h2>{data && <span className={'register-status' + (data.dayClose ? ' is-closed' : '')}>{tr(data.dayClose ? 'Day closed' : date === today ? 'Day open' : 'Not closed')}</span>}</div>
      <div className="register-actions"><button type="button" className="secondary" onClick={() => window.print()}><Icon name="receipt" size={16} />{tr('Print day sheet')}</button><button type="button" className="secondary" disabled={busy === 'export'} onClick={exportMonth}><Icon name="download" size={16} />{tr(busy === 'export' ? 'Preparing…' : 'Export month (CSV)')}</button></div>
    </section>
    {error && <p className="err" role="alert">{tr(error)}</p>}{notice && <p className="ok register-notice" role="status">{tr(notice)}</p>}
    {loading && !data && <p className="admin-empty" role="status">{tr('Loading the register…')}</p>}
    {data && <>
      <div className="register-kpis">{[
        ['Sales', s.salesCents, `${s.salesCount} ${tr(s.salesCount === 1 ? 'bill' : 'bills')}` + (s.creditSalesCents ? ` · ${rupees(s.creditSalesCents)} ${tr('on credit')}` : ''), 'bag', 'is-in'],
        ['Money received', s.receivedCents, tr('Cash, UPI and card from customers'), 'cash', 'is-in'],
        ['Purchases', s.purchasesCents, `${s.purchasesCount} ${tr(s.purchasesCount === 1 ? 'bill' : 'bills')}` + (s.purchaseTaxCents ? ` · ${tr('GST')} ${rupees(s.purchaseTaxCents)}` : ''), 'truck', 'is-out'],
        ['Paid to suppliers', s.supplierPaidCents, tr('With bills and separate payments'), 'receipt', 'is-out'],
        ['Expenses', s.expensesCents, Object.entries(data.expenseByCategory).map(([category, value]) => `${tr(category)} ${rupees(value)}`).join(' · ') || tr('No expenses'), 'tool', 'is-out'],
        ['Website orders', s.websiteCents, `${s.websiteOrders} ${tr(s.websiteOrders === 1 ? 'order' : 'orders')} · ${tr('tracked in Orders')}`, 'grid', ''],
      ].map(([label, value, hint, icon, tone]) => <div key={label} className={tone}><span><small>{tr(label)}</small><Icon name={icon} size={18} /></span><b>{rupees(value)}</b><p>{hint}</p></div>)}</div>
      <section className="register-books"><CashCard title="Cash in hand" icon="cash" book={data.cash} /><CashCard title="Bank / UPI" icon="qr" book={data.bank} /><DayClose key={date + (data.dayClose?.updatedAt || '')} date={date} data={data} onSaved={saved} /></section>
      <p className="register-dues"><span>{tr('Customers owe you')}: <b>{rupees(s.customerDuesCents)}</b></span><span>{tr('You owe suppliers')}: <b>{rupees(s.supplierDuesCents)}</b></span></p>
    </>}
    <section className="admin-panel register-entry" ref={entryRef}><div className="admin-section-title"><h3>{tr('New entry')}</h3><div className="register-shortcuts"><button type="button" className="link" onClick={() => open('Counter bills')}>{tr('+ New sale (counter bill)')}</button><button type="button" className="link" onClick={() => open('Bookkeeping')}>{tr('+ Customer payment')}</button></div></div>
      <div className="admin-chips register-tabs" role="tablist">{[['purchase', 'Purchase', 'truck'], ['payment', 'Supplier payment', 'receipt'], ['expense', 'Expense', 'tool']].map(([key, label, icon]) => <button type="button" role="tab" key={key} aria-selected={tab === key} aria-pressed={tab === key} onClick={() => setTab(key)}><Icon name={icon} size={15} />{tr(label)}</button>)}</div>
      {tab === 'purchase' && <PurchaseForm entry={entries.purchase} products={products} suppliers={data?.suppliers || []} gstRates={data?.gstRates || [0, 5, 12, 18, 28]} />}
      {tab === 'payment' && <PaymentForm entry={entries.payment} suppliers={data?.suppliers || []} />}
      {tab === 'expense' && <ExpenseForm entry={entries.expense} categories={data?.expenseCategories || ['Rent', 'Utilities', 'Transport', 'Wages', 'Shop supplies', 'Other']} />}
    </section>
    {data && <section className="admin-panel register-table"><div className="admin-section-title"><h3>{tr('Entries for the day')} <span className="mini-badge">{rows.length}</span></h3></div>
      <div className="admin-chips" role="group" aria-label={tr('Filter entries')}>{FILTERS.map(([key, label, test]) => { const n = rows.filter(test).length; return (key === 'all' || n > 0) && <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{tr(label)}<span>{n}</span></button>; })}</div>
      {shown.length ? <AdminTable label="Entries for the day" mobileCards numericColumns={[5, 6, 8, 9]} minWidth={1180}><thead><tr><th>{tr('Time')}</th><th>{tr('Type')}</th><th>{tr('Reference')}</th><th>{tr('Party')}</th><th>{tr('Details')}</th><th>{tr('Amount')}</th><th>{tr('Paid / received')}</th><th>{tr('Mode')}</th><th>{tr('Cash')}</th><th>{tr('Bank / UPI')}</th><th>{tr('Actions')}</th></tr></thead><tbody>{shown.map(row => <tr key={row.id} className={row.voided ? 'is-voided' : ''}>
        <td>{timeOf(row)}</td><td><span className={'register-kind is-' + row.kind}>{tr(KINDS[row.kind])}</span></td><td><BookReference value={row.reference} />{row.billNumber && <small>{tr('Bill no.')} {row.billNumber}</small>}</td><td>{row.party ? tr(row.party) : '—'}</td><td className="register-details">{tr(row.details)}{row.voided && <small className="register-void-reason">{tr('Cancelled')}: {row.voidReason}</small>}</td>
        <td><b>{rupees(row.amountCents)}</b>{row.taxCents > 0 && <small>{tr('incl. GST')} {rupees(row.taxCents)}</small>}</td><td>{row.kind === 'journal' ? '—' : rupees(row.settledCents)}</td><td>{tr(MODES[row.mode] || row.mode)}</td>
        <td className={row.cashCents > 0 ? 'register-plus' : row.cashCents < 0 ? 'register-minus' : ''}>{signed(row.cashCents)}</td><td className={row.bankCents > 0 ? 'register-plus' : row.bankCents < 0 ? 'register-minus' : ''}>{signed(row.bankCents)}</td>
        <td>{['purchase', 'supplier-payment', 'expense'].includes(row.kind) && !row.voided ? <button type="button" className="link danger" disabled={Boolean(busy)} onClick={() => cancel(row)}>{tr('Cancel entry')}</button> : row.billId ? <button type="button" className="link" onClick={() => open('Counter bills', { bill: row.billId })}>{tr('Open bill')}</button> : null}</td>
      </tr>)}</tbody></AdminTable> : <p className="admin-empty">{tr(rows.length ? 'No entries of this type.' : 'No entries on this day yet. Add a purchase or expense above, or make a counter bill.')}</p>}
      <p className="muted">{tr('Cancelled entries stay in the register for your records and are left out of every total. Website orders are tracked in Orders and are not part of this cash book.')}</p>
    </section>}
    {data && <Suppliers suppliers={data.suppliers} onPay={paySupplier} />}
  </div>;
}

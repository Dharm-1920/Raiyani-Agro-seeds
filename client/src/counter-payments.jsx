import { useEffect, useState } from 'react';
import api, { errMsg } from './api';
import { tr } from './language.jsx';
import { billFinancials, money, indiaDate } from './counter-ledger';
import { useAuth } from './context';
const empty = () => ({ requestKey: crypto.randomUUID(), amount: '', method: 'cash', note: '' });
function restore(key) {
  try { const draft = JSON.parse(sessionStorage.getItem(key)); if (draft?.form?.requestKey) return draft; } catch { /* Start fresh if storage is unavailable. */ }
  return { form: empty(), uncertain: false };
}
export default function CounterPayments({ bill, onUpdate, configured }) {
  const { user } = useAuth(), storageKey = 'counter-receipt-' + user.id + '-' + bill._id;
  const [form, setForm] = useState(() => restore(storageKey).form), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [link, setLink] = useState(''), [uncertain, setUncertain] = useState(() => restore(storageKey).uncertain), [reminder, setReminder] = useState(null);
  const { paidCents, balanceCents } = billFinancials(bill);
  useEffect(() => { const draft = restore(storageKey); setForm(draft.form); setError(''); setLink(''); setUncertain(Boolean(draft.uncertain)); setNotice(''); }, [storageKey]);
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify({ form, uncertain })); } catch { /* The in-memory key still protects retries. */ } }, [storageKey, form, uncertain]);
  useEffect(() => {
    let active = true;
    api.get(`/admin/counter-bills/${bill._id}/reminder-status`).then(({ data }) => { if (active) setReminder(data); }).catch(() => { if (active) setReminder(null); });
    return () => { active = false; };
  }, [bill._id, bill.nextReminderAt, bill.paidCents]);
  const save = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setNotice(''); setLink('');
    try {
      const { data } = await api.post(`/admin/counter-bills/${bill._id}/payments`, form);
      onUpdate(data); setForm(empty()); setUncertain(false); setNotice('Payment recorded. The customer balance is updated.');
    } catch (failure) {
      setError(errMsg(failure));
      if (!failure.response || failure.response.status >= 500) setUncertain(true);
      // Refresh after a concurrent receipt, preserving this receipt's key for a safe retry.
      if (failure.response?.status === 409) { try { onUpdate((await api.get(`/admin/counter-bills/${bill._id}`)).data); } catch { /* Keep the error for retry. */ } }
    } finally { setBusy(false); }
  };
  const toggle = async enabled => {
    setBusy(true); setError(''); setLink('');
    try { onUpdate((await api.put(`/admin/counter-bills/${bill._id}/reminders`, { enabled })).data); }
    catch (failure) { setError(errMsg(failure)); } finally { setBusy(false); }
  };
  const manual = async () => {
    setBusy(true); setError(''); setLink('');
    try { setLink((await api.get(`/admin/counter-bills/${bill._id}/reminder`)).data.url); }
    catch (failure) { setError(errMsg(failure)); } finally { setBusy(false); }
  };
  return <section className="counter-screen-only counter-payment-records">
    <div className="counter-balance-cards"><div><small>{tr('Bill total')}</small><b>{money(bill.totalAmount)}</b></div><div><small>{tr('Received')}</small><b>{money(paidCents / 100)}</b></div><div><small>{tr('Balance due')}</small><b>{money(balanceCents / 100)}</b></div></div>
    {error && <p className="err" role="alert">{tr(error)}</p>}{notice && <p className="counter-notice" role="status">{tr(notice)}</p>}
    {balanceCents > 0 && <form onSubmit={save} className="counter-receipt-form"><h3>{tr('Record a payment')}</h3><fieldset disabled={busy || uncertain}><div className="formgrid"><label>{tr('Amount received (₹)')}<input type="number" min="0.01" step="0.01" max={balanceCents / 100} required value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label><label>{tr('Received by')}<select value={form.method} onChange={event => setForm({ ...form, method: event.target.value })}><option value="cash">{tr('Cash')}</option><option value="upi">UPI</option><option value="card">{tr('Card')}</option></select></label><label className="counter-wide">{tr('Receipt note (optional)')}<input maxLength={250} value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} /></label></div></fieldset><p className="muted">{tr('Record only money actually received. Part payments reduce the balance; full payment stops reminders.')}</p>{uncertain && <p>{tr('Retry this same payment to confirm it without creating a duplicate receipt.')}</p>}<button disabled={busy}>{tr(uncertain ? 'Retry payment' : 'Record payment')}</button></form>}
    {balanceCents > 0 && <div className="counter-reminder-controls"><label className="counter-consent"><input type="checkbox" disabled={busy || !bill.shipping.phone} checked={Boolean(bill.remindersEnabled)} onChange={event => toggle(event.target.checked)} /><span>{tr('Customer agrees to WhatsApp payment reminders every 15 days.')}</span></label>{bill.remindersEnabled ? <><p>{tr('Next reminder')}: {indiaDate(bill.nextReminderAt)}</p><p className="muted">{tr(configured ? 'Automatic reminders run while the website server is running.' : 'Automatic reminders are not connected. You can prepare a reminder for manual WhatsApp sending.')}</p>{reminder?.latest && <p>{tr('Last reminder')}: {tr(reminder.latest.status)}{reminder.latest.acceptedAt && ` · ${indiaDate(reminder.latest.acceptedAt)}`}</p>}<button type="button" className="secondary" disabled={busy} onClick={manual}>{tr('Prepare WhatsApp reminder')}</button></> : <p className="muted">{tr('Reminders are off. A customer phone number and agreement are required to enable them.')}</p>}{link && <p><a href={link} target="_blank" rel="noreferrer" className="counter-whatsapp-link">{tr('Open customer WhatsApp')} ↗</a></p>}</div>}
    {balanceCents === 0 && <p className="counter-notice">{tr('Paid in full. No further payment reminders will be sent.')}</p>}
    <details><summary>{tr('Payment history')}</summary>{bill.payments?.length ? <table><thead><tr>{['Date', 'Received by', 'Amount', 'Note'].map(label => <th key={label}>{tr(label)}</th>)}</tr></thead><tbody>{bill.payments.map((payment, index) => <tr key={payment.requestKey || index}><td>{indiaDate(payment.receivedAt)}</td><td>{tr(payment.method)}</td><td>{money(payment.amountCents / 100)}</td><td>{payment.note}</td></tr>)}</tbody></table> : <p>{tr('No payments recorded yet.')}</p>}</details>
  </section>;
}

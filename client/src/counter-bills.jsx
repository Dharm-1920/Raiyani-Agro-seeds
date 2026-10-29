import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from './api';
import { tr, useLanguage } from './language.jsx';
import { useAuth } from './context';
import { SHOP } from './config';
import { useLocation, useNavigate } from 'react-router-dom';
import CounterPayments from './counter-payments';
import { billFinancials } from './counter-ledger';
import CounterCustomerPicker from './counter-customer-picker';
import './counter-bills.css';
import CounterProductPicker from './counter-product-picker';

const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const newDraft = language => ({ requestKey: crypto.randomUUID(), customerRequestKey: crypto.randomUUID(), customerId: '', saveCustomer: true, customer: { name: '', phone: '', address: '' }, items: [], discount: '0', paymentMethod: 'cash', paymentStatus: 'paid', invoiceLanguage: language, invoiceWhatsApp: false, remindersEnabled: false });
const billNumber = bill => 'CS-' + bill._id.toUpperCase();
const deliveryText = status => ({ accepted: 'Accepted by the WhatsApp service', pending: 'Queued for WhatsApp', sending: 'Sending on WhatsApp', failed: 'WhatsApp sending failed. Share the bill manually.', not_requested: 'WhatsApp was not requested' })[status] || 'Queued for WhatsApp';

function Receipt({ bill }) {
  const gu = bill.invoiceLanguage === 'gu';
  const { paidCents, balanceCents } = billFinancials(bill);
  const t = text => gu ? ({ 'Counter bill': 'દુકાનનું બિલ', 'Date': 'તારીખ', 'Customer': 'ગ્રાહક', 'Item': 'વસ્તુ', 'Quantity': 'જથ્થો', 'Rate': 'ભાવ', 'Amount': 'રકમ', 'Items total': 'વસ્તુઓનું કુલ', 'Discount': 'છૂટ', 'Total': 'કુલ', 'Payment': 'ચુકવણી', 'paid': 'ચૂકવાયેલ', 'pending': 'બાકી', 'cash': 'રોકડ', 'card': 'કાર્ડ', 'upi': 'UPI', 'Payment pending. This bill is not a payment receipt.': 'ચુકવણી બાકી છે. આ બિલ ચુકવણીની રસીદ નથી.', 'Thank you for shopping with us.': 'અમારી પાસેથી ખરીદી કરવા બદલ આભાર.', 'Tax is not itemized.': 'કરની અલગ ગણતરી દર્શાવેલી નથી.' })[text] || text : text;
  return <article className="counter-receipt" lang={bill.invoiceLanguage}>
    <header><img src={`/assets/logo-${gu ? 'gu' : 'en'}.png`} alt="" /><div><h2>{gu ? 'રૈયાણી એગ્રો સીડ્સ' : SHOP.name}</h2><p>{SHOP.address}</p><p>{SHOP.phone} · {SHOP.email}</p></div></header>
    <div className="counter-receipt-meta"><div><strong>{t('Counter bill')}</strong><p>{billNumber(bill)}</p></div><div>{t('Date')}<p>{new Date(bill.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p></div></div>
    <div className="counter-receipt-customer"><small>{t('Customer')}</small><strong>{bill.shipping.name}</strong>{bill.shipping.phone && <span>{bill.shipping.phone}</span>}{bill.shipping.address && <span>{bill.shipping.address}</span>}</div>
    <table><thead><tr>{['Item', 'Quantity', 'Rate', 'Amount'].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>{bill.items.map((item, index) => <tr key={index}><td>{gu && item.nameGu ? item.nameGu : item.name}{item.unit && <small>{item.unit}</small>}</td><td>{item.qty}</td><td>{money(item.price)}</td><td>{money(Math.round(Math.round(item.price * 100) * item.qty) / 100)}</td></tr>)}</tbody></table>
    <dl><div><dt>{t('Items total')}</dt><dd>{money(bill.itemsTotal)}</dd></div>{bill.discount > 0 && <div><dt>{t('Discount')}</dt><dd>−{money(bill.discount)}</dd></div>}<div><dt>{t('Total')}</dt><dd>{money(bill.totalAmount)}</dd></div><div><dt>{gu ? 'મળેલી રકમ' : 'Received'}</dt><dd>{money(paidCents / 100)}</dd></div><div className="counter-grand-total"><dt>{gu ? 'બાકી રકમ' : 'Balance due'}</dt><dd>{money(balanceCents / 100)}</dd></div></dl>
    <p>{t('Payment')}: {bill.paymentMethod === 'later' ? gu ? 'પછી ચુકવણી' : 'Pay later' : t(bill.paymentMethod)} · {bill.paymentStatus === 'partial' ? gu ? 'આંશિક ચુકવણી' : 'Partly paid' : t(bill.paymentStatus)}</p>{balanceCents > 0 && <p className="counter-payment-note">{t('Payment pending. This bill is not a payment receipt.')}</p>}
    <footer>{t('Thank you for shopping with us.')}<br />{t('Tax is not itemized.')}</footer>
  </article>;
}

export default function CounterBills() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const location = useLocation(), navigate = useNavigate();
  const storageKey = 'counter-bill-draft-' + user.id;
  const [draft, setDraft] = useState(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey)); if (saved?.requestKey && Array.isArray(saved.items)) return saved; } catch { /* Start a fresh draft if storage is unavailable. */ }
    return newDraft(language);
  });
  const [list, setList] = useState({ items: [], total: 0, whatsappConfigured: false });
  const [page, setPage] = useState(1), [loading, setLoading] = useState(true), [listError, setListError] = useState('');
  const [selected, setSelected] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [delivery, setDelivery] = useState(null), [shareLink, setShareLink] = useState('');
  const [retryPayload, setRetryPayload] = useState(null);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const submitLock = useRef(false);
  const listSequence = useRef(0);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('bill');
    if (!id) return;
    let active = true;
    api.get('/admin/counter-bills/' + encodeURIComponent(id)).then(({ data }) => { if (active) setSelected(data); }).catch(failure => { if (active) setError(errMsg(failure)); });
    return () => { active = false; };
  }, [location.search]);
  useEffect(() => {
    const params = new URLSearchParams(location.search), id = params.get('customer');
    if (!id || params.has('bill')) return;
    let active = true;
    api.get('/admin/counter-customers/' + encodeURIComponent(id)).then(({ data }) => {
      if (active) { setSelected(null); setDraft(current => ({ ...current, customerId: data._id, customer: { name: data.name, phone: data.phone || '', address: data.address || '' }, invoiceLanguage: data.preferredLanguage || current.invoiceLanguage, invoiceWhatsApp: false, remindersEnabled: false })); }
    }).catch(failure => { if (active) setError(errMsg(failure)); });
    return () => { active = false; };
  }, [location.search]);
  const load = async () => {
    const sequence = ++listSequence.current;
    setLoading(true); setListError('');
    try { const { data } = await api.get('/admin/counter-bills', { params: { page } }); if (sequence === listSequence.current) setList(data); }
    catch (failure) { if (sequence === listSequence.current) setListError(errMsg(failure)); }
    finally { if (sequence === listSequence.current) setLoading(false); }
  };
  useEffect(() => { load(); return () => { listSequence.current++; }; }, [page]);
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Saving a bill still works without browser storage. */ } }, [draft, storageKey]);
  useEffect(() => { setDelivery(null); setShareLink(''); }, [selected?._id]);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const chooseCustomer = customer => {
    setDraft(current => ({ ...current, customerId: customer._id, customer: { name: customer.name, phone: customer.phone || '', address: customer.address || '' }, invoiceLanguage: customer.preferredLanguage || current.invoiceLanguage, invoiceWhatsApp: false, remindersEnabled: false }));
    navigate('/admin?tab=Counter%20bills&customer=' + customer._id, { replace: true });
  };
  const clearCustomer = () => {
    setDraft(current => ({ ...current, customerId: '', customerRequestKey: crypto.randomUUID(), customer: { name: '', phone: '', address: '' }, saveCustomer: true, invoiceWhatsApp: false, remindersEnabled: false }));
    if (new URLSearchParams(location.search).has('customer')) navigate('/admin?tab=Counter%20bills', { replace: true });
  };
  const reset = () => {
    setDraft(newDraft(language)); setSelected(null); setError(''); setNotice(''); setRetryPayload(null);
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
    if (new URLSearchParams(location.search).has('bill') || new URLSearchParams(location.search).has('customer')) navigate('/admin?tab=Counter%20bills', { replace: true });
  };
  const save = async event => {
    event.preventDefault();
    if (submitLock.current) return;
    if (!draft.items.length) { setError('Add at least one product or manual item before saving.'); return; }
    submitLock.current = true;
    let payload = retryPayload || draft;
    setBusy('save'); setError(''); setNotice('');
    try {
      if (!payload.customerId && payload.saveCustomer !== false) {
        payload = { ...payload, customerRequestKey: payload.customerRequestKey || payload.requestKey.slice(0, 60) + '-customer' };
        const response = await api.post('/admin/counter-customers', { ...payload.customer, requestKey: payload.customerRequestKey, preferredLanguage: payload.invoiceLanguage });
        const customer = response.data;
        payload = { ...payload, customerId: customer._id, customer: { name: customer.name, phone: customer.phone || '', address: customer.address || '' } };
        setDraft(current => current.requestKey === payload.requestKey ? { ...current, customerId: payload.customerId, customer: payload.customer, customerRequestKey: payload.customerRequestKey } : current);
      }
      const { data } = await api.post('/admin/counter-bills', payload);
      setSelected(data); setDraft(newDraft(language)); setRetryPayload(null);
      setNotice('Bill saved. You can print it or share it with the customer.');
      await load();
    } catch (failure) {
      setError(errMsg(failure));
      // Keep the exact request after a timeout so retrying cannot create a second sale.
      if (!failure.response || failure.response.status >= 500) setRetryPayload(payload);
      else { setRetryPayload(null); setInventoryVersion(value => value + 1); }
    } finally { setBusy(''); submitLock.current = false; }
  };
  const pdf = async () => (await api.get(`/admin/counter-bills/${selected._id}/invoice`, { params: { lang: selected.invoiceLanguage }, responseType: 'blob' })).data;
  const savePdf = blob => {
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `counter-bill-${selected._id}.pdf`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const action = async (name, run) => {
    setBusy(name); setError(''); setNotice('');
    try { await run(); }
    catch (failure) {
      let message = errMsg(failure);
      if (failure.response?.data instanceof Blob) { try { message = JSON.parse(await failure.response.data.text()).message || message; } catch { /* Keep the request error. */ } }
      setError(message);
    } finally { setBusy(''); }
  };
  const share = () => action('share', async () => {
    const { data } = await api.post(`/admin/counter-bills/${selected._id}/share`);
    if (data.publicWebsite) {
      setShareLink('https://wa.me/' + data.phone.replace(/\D/g, '') + '?text=' + encodeURIComponent(`${SHOP.name}\n${billNumber(selected)}\n${money(selected.totalAmount)}\n${data.url}`));
      setNotice('Open WhatsApp below, check the customer number and send the bill link. The link expires in 7 days.');
    } else {
      const blob = await pdf();
      const file = new File([blob], `counter-bill-${selected._id}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: SHOP.name }); return; } catch (failure) { if (failure.name === 'AbortError') return; }
      }
      savePdf(blob);
      setShareLink('https://wa.me/' + data.phone.replace(/\D/g, ''));
      setNotice('PDF downloaded. Open the customer chat and attach this PDF.');
    }
  });
  const subtotalCents = draft.items.reduce((sum, item) => sum + Math.round(Math.round(Number(item.price || 0) * 100) * Number(item.qty || 0)), 0);
  const total = Math.max(0, subtotalCents - Math.round(Number(draft.discount || 0) * 100)) / 100;

  return <div className="counter-billing">
    <div className="counter-screen-only counter-intro"><div><span className="eyebrow">{tr('AT THE SHOP COUNTER')}</span><h2>{tr('A bill for every walk-in.')}</h2><p>{tr('Enter the sale, set your price and hand over a printed or WhatsApp bill.')}</p></div><span className="tag">{tr('Admin only')}</span></div>
    {error && <p className="err counter-screen-only" role="alert">{tr(error)}</p>}
    {notice && <p className="counter-notice counter-screen-only" role="status">{tr(notice)}</p>}
    {selected ? <section className="admin-panel counter-detail">
      <div className="counter-screen-only counter-actions"><h3>{tr('Saved bill')}</h3><button type="button" disabled={Boolean(busy)} onClick={() => window.print()}>{tr('Print bill')}</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => action('download', async () => savePdf(await pdf()))}>{tr('Download PDF')}</button>{selected.invoiceWhatsApp && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={share}>{tr('Share on WhatsApp')}</button>}<button type="button" className="secondary" disabled={Boolean(busy)} onClick={reset}>{tr('New bill')}</button></div>
      {shareLink && <p className="counter-screen-only"><a className="counter-whatsapp-link" href={shareLink} target="_blank" rel="noreferrer">{tr('Open customer WhatsApp')} ↗</a></p>}
      <div className="counter-screen-only counter-delivery"><span>{tr(selected.invoiceWhatsApp ? 'WhatsApp bill requested' : 'WhatsApp was not requested')}</span><button className="link" disabled={Boolean(busy)} onClick={() => action('status', async () => setDelivery((await api.get(`/admin/counter-bills/${selected._id}/delivery`)).data))}>{tr('Check sending status')}</button>{delivery && <p role="status">{tr(!delivery.requested ? 'WhatsApp was not requested' : !delivery.configured && delivery.status !== 'accepted' ? 'Automatic WhatsApp is not connected. Use Share on WhatsApp.' : deliveryText(delivery.status))}</p>}</div>
      <CounterPayments bill={selected} configured={Boolean(list.remindersConfigured)} onUpdate={bill => { setSelected(bill); load(); }} />
      <Receipt bill={selected} />
    </section> : <form className="counter-screen-only" onSubmit={save}>
      <fieldset disabled={Boolean(busy) || Boolean(retryPayload)} className="counter-form">
        <CounterProductPicker items={draft.items} inventoryVersion={inventoryVersion} onChange={change => setDraft(current => ({ ...current, items: change(current.items) }))} />
        <section className="admin-panel" id="counter-checkout"><h3>{tr('Customer details')}</h3>
          <CounterCustomerPicker customerId={draft.customerId} disabled={Boolean(busy)} onSelect={chooseCustomer} onClear={clearCustomer} />
          <div className="formgrid"><label>{tr('Customer name')}<input required readOnly={Boolean(draft.customerId)} maxLength={120} value={draft.customer.name} onChange={event => update('customer', { ...draft.customer, name: event.target.value })} autoComplete="name" /></label><label>{tr('Customer WhatsApp number')}<input type="tel" readOnly={Boolean(draft.customerId)} maxLength={40} placeholder="+91" value={draft.customer.phone} onChange={event => update('customer', { ...draft.customer, phone: event.target.value })} autoComplete="tel" /></label><label className="counter-wide">{tr('Address (optional)')}<input readOnly={Boolean(draft.customerId)} maxLength={500} value={draft.customer.address} onChange={event => update('customer', { ...draft.customer, address: event.target.value })} /></label></div>
          {!draft.customerId && <label className="counter-consent"><input type="checkbox" checked={draft.saveCustomer !== false} onChange={event => update('saveCustomer', event.target.checked)} /><span>{tr('Save this customer for future visits when saving the bill.')}</span></label>}
          <label className="counter-consent"><input type="checkbox" checked={draft.invoiceWhatsApp} onChange={event => update('invoiceWhatsApp', event.target.checked)} /><span>{tr('Customer requests this bill on WhatsApp.')}</span></label><p className="muted">{tr(list.whatsappConfigured ? 'Requested bills are queued for automatic WhatsApp sending after saving.' : 'Automatic WhatsApp is not connected. Share the saved bill using WhatsApp.')}</p></section>
        <section className="admin-panel counter-payment">
          <div><h3>{tr('Payment & bill')}</h3><div className="formgrid">
            <label>{tr('Payment method')}<select value={draft.paymentMethod} onChange={event => setDraft(current => ({ ...current, paymentMethod: event.target.value, paymentStatus: event.target.value === 'later' ? 'pending' : current.paymentStatus }))}><option value="cash">{tr('Cash')}</option><option value="upi">UPI</option><option value="card">{tr('Card')}</option><option value="later">{tr('Pay later (credit)')}</option></select></label>
            <label>{tr('Payment status')}<select value={draft.paymentStatus} disabled={draft.paymentMethod === 'later'} onChange={event => setDraft(current => ({ ...current, paymentStatus: event.target.value, remindersEnabled: event.target.value === 'paid' ? false : current.remindersEnabled }))}><option value="paid">{tr('Payment received')}</option><option value="pending">{tr('Pay later')}</option></select></label>
            <label>{tr('Discount (₹)')}<input type="number" min="0" max={subtotalCents / 100} step="0.01" required value={draft.discount} onChange={event => update('discount', event.target.value)} /></label><label>{tr('Bill language')}<select value={draft.invoiceLanguage} onChange={event => update('invoiceLanguage', event.target.value)}><option value="en">English</option><option value="gu">ગુજરાતી</option></select></label>
          </div>{draft.paymentStatus === 'pending' && <div className="counter-credit-note"><strong>{tr('Credit sale — payment is due later')}</strong><label className="counter-consent"><input type="checkbox" checked={Boolean(draft.remindersEnabled)} onChange={event => update('remindersEnabled', event.target.checked)} /><span>{tr('Customer agrees to WhatsApp payment reminders every 15 days.')}</span></label><p>{tr('First reminder: 15 days after saving. Reminders stop when the full payment is recorded.')}</p><p className="muted">{tr(list.remindersConfigured ? 'Automatic reminder service is connected.' : 'Automatic reminders need the WhatsApp reminder service. Manual reminders remain available.')}</p></div>}<p className="muted">{tr('Mark payment received only after checking the cash, card or bank payment.')}</p></div>
          <div className="counter-total"><span>{tr('Items total')}: {money(subtotalCents / 100)}</span><strong>{money(total)}</strong><small>{tr(draft.paymentStatus === 'pending' ? 'Balance due after saving' : 'Bill total after discount')}</small><button disabled={Boolean(busy)}>{tr(busy === 'save' ? 'Saving bill…' : 'Save bill')}</button></div>
        </section>
      </fieldset>
      {retryPayload && <div className="counter-notice"><p>{tr('The last save could not be confirmed. Retry the same bill to avoid a duplicate.')}</p><button disabled={Boolean(busy)}>{tr('Retry saving bill')}</button></div>}
    </form>}
    {!selected && <div className="counter-mobile-total counter-screen-only"><div><small>{draft.items.filter(item => item.name || item.productId).length} {tr('items selected')}</small><strong>{money(total)}</strong></div><a href="#counter-current-bill">{tr('Review bill')} ↑</a></div>}
    <section className="admin-panel counter-screen-only"><div className="admin-section-title"><h3>{tr('Counter bill history')} <span className="mini-badge">{list.total}</span></h3><button type="button" className="secondary" disabled={loading} onClick={load}>{tr('Refresh bills')}</button></div>{loading ? <p role="status">{tr('Loading bills…')}</p> : listError ? <p className="err" role="alert">{tr(listError)}</p> : list.items.length ? <table><thead><tr>{['Bill', 'Customer', 'Date', 'Total', 'Payment', 'Actions'].map(text => <th key={text}>{tr(text)}</th>)}</tr></thead><tbody>{list.items.map(bill => <tr key={bill._id}><td><b>CS-{bill._id.slice(-8).toUpperCase()}</b></td><td>{bill.shipping.name}<small>{bill.shipping.phone}</small></td><td>{new Date(bill.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</td><td>{money(bill.totalAmount)}</td><td>{tr(bill.paymentMethod)} · {tr(bill.paymentStatus)}</td><td><button type="button" className="secondary" disabled={Boolean(busy)} onClick={() => { setSelected(bill); setNotice(''); setError(''); }}>{tr('Open bill')}</button></td></tr>)}</tbody></table> : <p className="admin-empty">{tr('Your saved counter bills will appear here.')}</p>}
      <div className="counter-pagination"><button type="button" className="secondary" disabled={page === 1 || loading} onClick={() => setPage(current => current - 1)}>{tr('Previous')}</button><span>{tr('Page')} {page} / {Math.max(1, Math.ceil(list.total / 25))}</span><button type="button" className="secondary" disabled={page * 25 >= list.total || loading} onClick={() => setPage(current => current + 1)}>{tr('Next')}</button></div>
    </section>
  </div>;
}

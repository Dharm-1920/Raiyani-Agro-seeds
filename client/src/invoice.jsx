import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from './api';
import { tr, useLanguage } from './language.jsx';
import Icon from './icons';
function savePdf(blob, orderId) {
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `purchase-invoice-${orderId}.pdf`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function getPdf(orderId, language) {
  const response = await api.get(`/orders/${orderId}/invoice`, { params: { lang: language }, responseType: 'blob' });
  if (!String(response.headers['content-type']).includes('application/pdf')) throw new Error('Invoice could not be generated. Please retry.');
  return response.data;
}
export function InvoicePreferences({ user, phone, whatsapp, setWhatsapp }) {
  const [options, setOptions] = useState(null);
  useEffect(() => { api.get('/auth/options').then(({ data }) => setOptions(data)).catch(() => {}); }, []);
  return <section className="checkout-invoice-note"><strong><Icon name="mail" size={17} /> {tr('Your purchase invoice')}</strong><p>{user.email}</p><p>{tr(options?.emailDelivery ? user.emailVerified ? 'Your PDF invoice will be emailed after you place the order.' : 'Verify your email to receive purchase invoices automatically.' : 'Your invoice will be available in My orders. Email delivery is currently unavailable.')}</p>{!user.emailVerified && options?.emailDelivery && <Link to="/account">{tr('Verify email in My account')} →</Link>}{options?.whatsappDelivery ? <label className="checkout-whatsapp"><input type="checkbox" checked={whatsapp} onChange={event => setWhatsapp(event.target.checked)} /><span>{tr('Also send my invoice to this WhatsApp number:')} <strong>{phone || tr('Enter your delivery phone above')}</strong>. {tr('I agree to receive this order’s invoice on WhatsApp.')}</span></label> : <p>{tr('You can share your PDF invoice on WhatsApp from My orders.')}</p>}</section>;
}
export default function InvoiceButton({ orderId }) {
  const { language } = useLanguage();
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [shareLink, setShareLink] = useState('');
  const [delivery, setDelivery] = useState(null), [statusError, setStatusError] = useState(''), [loadingStatus, setLoadingStatus] = useState(false);
  const fail = async error => {
    let text = errMsg(error);
    if (error.response?.data instanceof Blob) { try { text = JSON.parse(await error.response.data.text()).message || text; } catch { /* Keep network error. */ } }
    setError(text);
  };
  const download = async () => {
    setBusy('download'); setError(''); setMessage('');
    try { savePdf(await getPdf(orderId, language), orderId); } catch (error) { await fail(error); } finally { setBusy(''); }
  };
  const share = async () => {
    setBusy('share'); setError(''); setMessage(''); setShareLink('');
    try {
      const pdf = await getPdf(orderId, language), file = new File([pdf], `purchase-invoice-${orderId}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Raiyani Agro Seeds purchase invoice' }); return; }
        catch (error) { if (error.name === 'AbortError') return; }
      }
      savePdf(pdf, orderId);
      setMessage('Invoice downloaded. Open WhatsApp and attach the downloaded PDF.');
      setShareLink('https://wa.me/?text=' + encodeURIComponent(`My Raiyani Agro Seeds purchase invoice, order #${orderId.slice(-8).toUpperCase()}.`));
    } catch (error) { await fail(error); } finally { setBusy(''); }
  };
  const loadStatus = async () => {
    setLoadingStatus(true); setStatusError('');
    try { setDelivery((await api.get(`/orders/${orderId}/invoice-delivery`)).data); }
    catch { setStatusError('Invoice delivery status could not be loaded.'); } finally { setLoadingStatus(false); }
  };
  const channelText = channel => {
    const row = delivery.deliveries.find(job => job.channel === channel);
    if (row?.status === 'accepted') return 'Accepted by the sending service';
    if (channel === 'email' && !delivery.emailConfigured || channel === 'whatsapp' && !delivery.whatsappConfigured) return 'Sending service is currently unavailable';
    if (channel === 'email' && !delivery.emailVerified) return 'Verify your email in My account';
    if (channel === 'whatsapp' && !delivery.whatsappRequested) return 'Not requested for this order';
    if (row?.status === 'failed') return 'Could not send. Contact the shop or download your invoice.';
    if (row || delivery.queued) return 'Queued for sending';
    return 'Download your invoice below';
  };
  return <div className="invoice-actions"><button type="button" className="secondary" disabled={Boolean(busy)} onClick={download}>{tr(busy === 'download' ? 'Preparing invoice…' : 'Download purchase invoice')}</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={share}><Icon name="phone" size={16} /> {tr(busy === 'share' ? 'Preparing invoice…' : 'Share invoice on WhatsApp')}</button>{error && <span className="err invoice-message" role="alert">{tr(error)}</span>}{message && <span className="invoice-message" role="status">{tr(message)} {shareLink && <a className="invoice-share-link" href={shareLink} target="_blank" rel="noreferrer">{tr('Open WhatsApp')} ↗</a>}</span>}<details className="invoice-status" onToggle={event => { if (event.currentTarget.open && !delivery && !loadingStatus) loadStatus(); }}><summary>{tr('Email & WhatsApp delivery')}</summary>{loadingStatus ? <p role="status">{tr('Checking delivery…')}</p> : delivery ? <><p>{tr('Email')}: {tr(channelText('email'))}</p><p>WhatsApp: {tr(channelText('whatsapp'))}</p><button type="button" className="link" onClick={loadStatus}>{tr('Refresh status')}</button></> : null}{statusError && <p className="err" role="alert">{tr(statusError)} <button type="button" className="link" onClick={loadStatus}>{tr('Retry')}</button></p>}</details></div>;
}

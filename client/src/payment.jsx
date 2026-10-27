import { tr } from "./language.jsx";
import { useEffect, useState } from 'react';
import api, { errMsg } from './api';
export const paymentError = errMsg;
export const refundText = o => o.refundStatus === 'completed' || o.paymentStatus === 'refunded' ? 'Refund completed.' : o.orderStatus === 'cancelled' && o.paymentStatus === 'paid' ? 'Refund review needed. Contact the shop about your payment.' : o.orderStatus === 'cancelled' && o.paymentReference ? 'If you already paid, contact the shop with your UPI reference for a refund review.' : '';
export function PaymentQR({
  orderId,
  onClose,
  onSubmitted
}) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [reference, setReference] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const load = async () => {
    setError('');
    try {
      const {
        data
      } = await api.get(`/orders/${orderId}/qr`);
      setData(data);
      setReference(data.order.paymentReference || '');
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    load();
  }, [orderId]);
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const {
        data
      } = await api.post(`/orders/${orderId}/payment-reference`, {
        reference
      });
      setMessage(data.message);
      onSubmitted?.();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return <section className="payment-qr" aria-label={tr("UPI payment")}><div className="row"><h2>{tr("Pay by UPI QR")}</h2><button className="secondary" onClick={onClose}>{tr("Close QR")}</button></div>{tr(error && <p className="err" role="alert">{tr(error)} {tr(!data && <button className="link" onClick={load}>{tr("Retry QR")}</button>)}</p>)}{tr(data ? <><img width="280" height="280" src={data.upi.qr} alt={tr("UPI QR code for this order")} /><p><b>{data.upi.name}</b><br />{tr(data.upi.upiId)}<br /><strong>₹{tr(Number(data.upi.amount).toLocaleString('en-IN'))}</strong></p><p>{tr("Scan with your UPI app. Check the recipient and amount before paying.")}</p><a className="btn secondary" href={data.upi.uri}>{tr("Open UPI app")}</a> <a className="text-link" href={data.upi.qr} download={`order-${orderId}-qr.png`}>{tr("Download QR")}</a><p className="payment-note">{tr("Already paid? Submit your reference below. Please avoid paying again. Your order stays pending until the shop verifies receipt.")}</p><form onSubmit={submit}><label>{tr("UPI transaction reference (UTR)")}<input required inputMode="numeric" pattern="[0-9]{12}" minLength="12" maxLength="12" value={reference} onChange={e => setReference(e.target.value)} placeholder={tr("12-digit UPI reference")} /></label><button disabled={busy}>{tr(busy ? 'Submitting…' : 'Submit payment reference')}</button></form>{tr(message && <p className="ok" role="status">{tr(message)}</p>)}</> : !error && <p>{tr("Generating your payment QR\u2026")}</p>)}</section>;
}

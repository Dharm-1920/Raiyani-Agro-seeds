import { tr } from "./language.jsx";
import { useEffect, useId, useRef, useState } from 'react';
import api, { errMsg } from './api';
import Icon from './icons';
import { CopyButton } from './shop-ui.jsx';
export const paymentError = errMsg;
export const refundText = o => o.refundStatus === 'completed' || o.paymentStatus === 'refunded' ? 'Refund completed.' : o.orderStatus === 'cancelled' && o.paymentStatus === 'paid' ? 'Refund review needed. Contact the shop about your payment.' : o.orderStatus === 'cancelled' && o.paymentReference ? 'If you already paid, contact the shop with your UPI reference for a refund review.' : '';
const rupees = n => '₹' + Number(n || 0).toLocaleString('en-IN');
// Guided UPI payment: 1) pay by app or QR, 2) send the 12-digit UTR, 3) the shop confirms receipt.
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
  const panel = useRef(null), heading = useRef(null), headingId = useId(), countId = useId();
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
    // "Pay now" may be tapped far down the order list; bring the payment panel into view.
    panel.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    heading.current?.focus({ preventScroll: true });
  }, [orderId]);
  const submit = async e => {
    e.preventDefault();
    e.stopPropagation();
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
  const amount = data ? rupees(data.upi.amount) : '';
  return <section className="payment-qr fx-upi" aria-labelledby={headingId} ref={panel}>
    <header className="fx-upi-head">
      <span className="fx-upi-badge" aria-hidden="true"><Icon name="qr" size={22} /></span>
      <div><h2 id={headingId} ref={heading} tabIndex={-1}>{tr('Pay by UPI QR')}</h2><small>{tr('Order')} #{orderId.slice(-8).toUpperCase()}</small></div>
      <button type="button" className="secondary fx-upi-close" onClick={onClose}><Icon name="close" size={16} />{tr('Close QR')}</button>
    </header>
    {error && <p className="err" role="alert">{tr(error)} {!data && <button type="button" className="link" onClick={load}>{tr('Retry QR')}</button>}</p>}
    {data ? <ol className="fx-upi-steps">
      <li className="fx-upi-step">
        <h3><span className="fx-num" aria-hidden="true">1</span>{tr('Pay')} {amount}</h3>
        <div className="fx-upi-pay">
          <figure className="fx-qr"><img width="280" height="280" src={data.upi.qr} alt={tr('UPI QR code for this order')} /><figcaption>{tr('Scan with your UPI app. Check the recipient and amount before paying.')}</figcaption></figure>
          <div className="fx-upi-details">
            <dl>
              <div><dt>{tr('Amount to pay')}</dt><dd className="fx-upi-amount">{amount}</dd></div>
              <div><dt>{tr('Pay to')}</dt><dd>{data.upi.name}</dd></div>
              <div><dt>UPI ID</dt><dd className="fx-upi-id"><code>{data.upi.upiId}</code><CopyButton text={data.upi.upiId} what="UPI ID" /></dd></div>
            </dl>
            <a className="btn fx-upi-app" href={data.upi.uri}><Icon name="phone" size={19} />{tr('Pay with UPI app')}</a>
            <p className="fx-tip"><Icon name="help" size={15} />{tr('On this phone? Tap the button. On a computer? Scan the QR with your phone.')}</p>
            <a className="text-link" href={data.upi.qr} download={`order-${orderId}-qr.png`}><Icon name="download" size={16} />{tr('Download QR')}</a>
          </div>
        </div>
      </li>
      <li className="fx-upi-step">
        <h3><span className="fx-num" aria-hidden="true">2</span>{tr('After paying, enter the 12-digit UTR')}</h3>
        <p className="payment-note">{tr('Already paid? Submit your reference below. Please avoid paying again. Your order stays pending until the shop verifies receipt.')}</p>
        <form onSubmit={submit}>
          <label>{tr('UPI transaction reference (UTR)')}<span className="fx-utr"><input required inputMode="numeric" autoComplete="off" pattern="[0-9]{12}" aria-describedby={countId} value={reference} onChange={e => setReference(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder={tr('12-digit UPI reference')} /><span id={countId} className={'fx-utr-count' + (reference.length === 12 ? ' is-complete' : '')}>{reference.length}/12</span></span></label>
          <details className="fx-help"><summary><Icon name="help" size={16} />{tr('Where do I find the UTR?')}</summary><ol><li>{tr('Open your UPI app and go to History.')}</li><li>{tr('Tap this payment.')}</li><li>{tr('Copy the 12-digit UPI Ref. No. or UTR.')}</li></ol></details>
          <button disabled={busy || reference.length !== 12}>{tr(busy ? 'Submitting…' : 'Submit payment reference')}</button>
        </form>
        {message && <p className="ok" role="status">{tr(message)}</p>}
      </li>
      <li className="fx-upi-step">
        <h3><span className="fx-num" aria-hidden="true">3</span>{tr('Shop confirms')}</h3>
        <p>{tr('The shop checks its bank account and confirms your order. You can see the status in My orders.')}</p>
      </li>
    </ol> : !error && <p role="status">{tr('Generating your payment QR…')}</p>}
  </section>;
}

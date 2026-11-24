// Shared storefront pieces: phone dock, purchase steps, order tracker, payment status
// and copy-to-clipboard. Styles live in shop-ui.css.
import { useEffect, useId, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth, useCart } from './context';
import { tr, useLanguage } from './language.jsx';
import Icon from './icons';

/** Bottom navigation for phones: the five places shoppers use most, always one tap away. */
export function MobileDock() {
  const { user } = useAuth();
  const { count } = useCart();
  const location = useLocation();
  useLanguage();
  const items = [
    { to: '/home', icon: 'home', label: 'Home', end: true },
    { to: '/shop', icon: 'grid', label: 'Shop' },
    { to: '/cart', icon: 'bag', label: 'Cart', badge: count },
    { to: '/orders', icon: 'receipt', label: 'Orders' },
    user ? { to: '/account', icon: 'user', label: 'Account' } : { to: '/login', icon: 'user', label: 'Sign in', state: { from: location.pathname + location.search } },
  ];
  return <nav className="fx-dock" aria-label={tr('Quick navigation')}>
    {items.map(item => <NavLink key={item.to} to={item.to} end={item.end} state={item.state} className="fx-dock-item">
      <span className="fx-dock-icon"><Icon name={item.icon} size={21} />{item.badge > 0 && <span className="fx-dock-badge" key={item.badge} aria-hidden="true">{item.badge > 99 ? '99+' : item.badge}</span>}</span>
      <span className="fx-dock-label">{tr(item.label)}</span>
      {item.badge > 0 && <span className="sr-only">({item.badge})</span>}
    </NavLink>)}
  </nav>;
}

const PURCHASE_STEPS = ['Cart', 'Delivery', 'Payment', 'Done'];
/** Shows new shoppers where they are in the purchase: Cart → Delivery → Payment → Done. */
export function PurchaseSteps({ current }) {
  useLanguage();
  return <ol className="fx-steps" aria-label={tr('Purchase progress')}>
    {PURCHASE_STEPS.map((step, index) => {
      const state = index < current ? 'done' : index === current ? 'current' : 'next';
      return <li key={step} className={'fx-step is-' + state} aria-current={state === 'current' ? 'step' : undefined}>
        <span className="fx-step-dot" aria-hidden="true">{state === 'done' ? <Icon name="check" size={14} /> : index + 1}</span>
        <span className="fx-step-label">{tr(step)}{state === 'done' && <span className="sr-only"> ({tr('Completed')})</span>}</span>
      </li>;
    })}
  </ol>;
}

export const ORDER_STATUS_LABELS = { placed: 'Placed', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
const TRACK = ['placed', 'confirmed', 'shipped', 'delivered'];
/** Placed → Confirmed → Shipped → Delivered, lit up to the order's current stage. */
export function OrderTracker({ status }) {
  useLanguage();
  const reached = TRACK.indexOf(status);
  if (reached < 0) return null;
  return <ol className="fx-track" aria-label={tr('Order progress')} style={{ '--fx-progress': reached / (TRACK.length - 1) }}>
    {TRACK.map((step, index) => <li key={step} className={index < reached ? 'is-done' : index === reached ? 'is-current' : ''} aria-current={index === reached ? 'step' : undefined}>
      <span className="fx-track-node" aria-hidden="true">{index < reached || index === reached && step === 'delivered' ? <Icon name="check" size={12} /> : null}</span>
      <span className="fx-track-label">{tr(ORDER_STATUS_LABELS[step])}</span>
    </li>)}
  </ol>;
}

/** Plain-language payment state for an order, with a colour tone for its badge. */
export function paymentState(order) {
  if (order.paymentStatus === 'refunded' || order.refundStatus === 'completed') return ['Refunded', 'muted'];
  if (order.paymentStatus === 'paid') return ['Paid', 'ok'];
  if (order.orderStatus === 'cancelled') return ['', ''];
  if (order.paymentMethod === 'cod') return ['Pay on delivery', 'info'];
  if (order.paymentStatus === 'failed') return ['Payment failed', 'bad'];
  if (order.paymentReference) return ['Verifying payment', 'warn'];
  return ['Awaiting payment', 'warn'];
}

/** Copies text, falling back to a hidden text area where the Clipboard API is unavailable (older Android WebViews). */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* Fall back below. */ }
  try {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'; area.style.top = '0';
    document.body.appendChild(area); area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch { return false; }
}

export function CopyButton({ text, what }) {
  const [state, setState] = useState('');
  const status = useId();
  useLanguage();
  useEffect(() => {
    if (!state) return;
    const timer = setTimeout(() => setState(''), 2400);
    return () => clearTimeout(timer);
  }, [state]);
  return <>
    <button type="button" className={'secondary fx-copy' + (state === 'ok' ? ' is-copied' : '')} aria-describedby={status} onClick={async () => setState(await copyText(text) ? 'ok' : 'fail')}>
      <Icon name={state === 'ok' ? 'check' : 'copy'} size={16} />{tr(state === 'ok' ? 'Copied' : 'Copy')}{what && <span className="sr-only"> {what}</span>}
    </button>
    <span id={status} className="sr-only" role="status">{state === 'ok' ? tr('Copied') : state === 'fail' ? tr('Could not copy. Select the text and copy it manually.') : ''}</span>
  </>;
}

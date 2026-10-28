import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context';
import { useNotifications } from './notifications.jsx';
import { tr, productText, useLanguage } from './language.jsx';
import api from './api';
import Icon from './icons';
import { AccountSecurity } from './auth.jsx';

function Avatar({ name, large = false }) {
  const initials = (name || '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={'profile-avatar' + (large ? ' profile-avatar-large' : '')} aria-hidden="true">{initials || <Icon name="user" />}</span>;
}
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const { unread } = useNotifications();
  useLanguage();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const root = useRef(null), trigger = useRef(null);
  const id = useId(), location = useLocation(), navigate = useNavigate();
  useEffect(() => { setOpen(false); setError(''); }, [location.pathname, location.hash, user?.id]);
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  if (!user) return null;
  const leave = async () => {
    setBusy(true); setError('');
    try { await logout(); navigate('/login', { replace: true }); }
    catch { setError('Could not sign out. Please try again.'); }
    finally { setBusy(false); }
  };
  return <div className="profile-menu" ref={root}>
    <button type="button" className={'profile-trigger' + (open ? ' is-open' : '')} ref={trigger} aria-label={`${tr('My profile')}: ${user.name}`} title={tr('My profile')} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><Avatar name={user.name} /></button>
    {open && <div className="profile-popover" id={id}><div className="profile-popover-heading"><Avatar name={user.name} /><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
      <nav className="profile-links" aria-label={tr('Profile shortcuts')} onClick={event => { if (event.target.closest('a')) setOpen(false); }}>
        <Link to="/account"><Icon name="user" size={19} /><span>{tr('My profile')}<small>{tr('Manage your personal details')}</small></span><Icon name="arrow" size={15} /></Link>
        <Link to="/orders"><Icon name="bag" size={19} /><span>{tr('Order')}<small>{tr('Track deliveries and download invoices')}</small></span><Icon name="arrow" size={15} /></Link>
        <Link to="/account#delivery-address"><Icon name="pin" size={19} /><span>{tr('Address')}<small>{tr('Ready for your next delivery')}</small></span><Icon name="arrow" size={15} /></Link>
        <Link to="/notifications"><Icon name="menu" size={19} /><span>{tr('Notifications')}</span>{unread > 0 && <span className="profile-unread">{unread > 99 ? '99+' : unread}</span>}</Link>
        {user.role === 'admin' && <Link to="/admin"><Icon name="shield" size={19} /><span>{tr('Admin')}</span><Icon name="arrow" size={15} /></Link>}
      </nav>
      {error && <p className="err" role="alert">{tr(error)}</p>}
      <button className="profile-signout" type="button" onClick={leave} disabled={busy}>{tr(busy ? 'Please wait…' : 'Sign out')} <Icon name="arrow" size={17} /></button>
    </div>}
  </div>;
}

export function AccountProfile() {
  const { user, updateProfile } = useAuth();
  const { language } = useLanguage();
  const location = useLocation();
  const addressField = useRef(null);
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', address: user.address || '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [history, setHistory] = useState({ loading: true, items: [], error: false });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setHistory({ loading: true, items: [], error: false });
    api.get('/orders/my', { signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setHistory({ loading: false, items: data.slice(0, 3), error: false });
    }).catch(() => { if (!controller.signal.aborted) setHistory({ loading: false, items: [], error: true }); });
    return () => controller.abort();
  }, [user.id, retry]);
  useEffect(() => {
    if (location.hash === '#delivery-address') {
      addressField.current?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      addressField.current?.focus({ preventScroll: true });
    }
  }, [location.hash]);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try { await updateProfile(form); setMessage('Your account details were saved.'); }
    catch { setError('Could not save your details. Please retry.'); }
    finally { setBusy(false); }
  };
  const editAddress = () => { addressField.current?.scrollIntoView({ block: 'center', behavior: 'auto' }); addressField.current?.focus({ preventScroll: true }); };
  return <div className="account-profile">
    <header className="account-hero"><Avatar name={user.name} large /><div><span className="eyebrow">{tr('YOUR PERSONAL SPACE')}</span><h1>{user.name}</h1><p>{user.email}</p></div><Link className="secondary account-shop-link" to="/shop">{tr('Continue shopping')} <Icon name="arrow" size={17} /></Link></header>
    <div className="account-layout"><aside className="account-sidebar"><h2>{tr('My account')}</h2><a href="#account-details"><Icon name="user" size={19} />{tr('Profile details')}</a><Link to="/orders"><Icon name="bag" size={19} />{tr('Order')}</Link><a href="#delivery-address" onClick={editAddress}><Icon name="pin" size={19} />{tr('Address')}</a><Link to="/notifications"><Icon name="menu" size={19} />{tr('Notifications')}</Link><div className="account-help"><Icon name="leaf" size={24} /><p>{tr('A little care. A better harvest.')}</p><Link to="/contact">{tr('Need help? Contact us')} →</Link></div></aside>
    <div className="account-content"><section className="account-panel"><div className="account-panel-heading"><div><span className="eyebrow">{tr('YOUR DELIVERIES')}</span><h2>{tr('Address')}</h2></div><button type="button" className="link" onClick={editAddress}>{tr(user.address ? 'Edit address' : 'Add address')}</button></div>{user.address ? <div className="saved-address-card"><span className="saved-address-icon"><Icon name="pin" /></span><div><strong>{user.name}</strong>{user.phone && <span>{user.phone}</span>}<p>{user.address}</p><small><Icon name="check" size={15} />{tr('Used automatically at checkout')}</small></div></div> : <div className="account-address-empty"><Icon name="pin" size={26} /><p>{tr('Save your delivery address for faster checkout.')}</p></div>}</section>
    <section className="account-panel account-recent"><div className="account-panel-heading"><div><span className="eyebrow">{tr('YOUR PURCHASES')}</span><h2>{tr('Recent orders')}</h2></div><Link to="/orders">{tr('View all orders')} →</Link></div>
      {history.loading ? <p role="status">{tr('Loading…')}</p> : history.error ? <p className="err" role="alert">{tr('Could not load recent orders.')} <button className="link" onClick={() => setRetry(n => n + 1)}>{tr('Retry')}</button></p> : !history.items.length ? <div className="account-orders-empty"><Icon name="bag" size={28} /><p>{tr('Your first harvest starts here.')}</p><span>{tr('Your purchases will appear here after you place an order.')}</span><Link to="/shop">{tr('Browse products')} →</Link></div> : history.items.map(order => <Link className="account-order-row" to="/orders" key={order._id}><span className="account-order-icon"><Icon name="bag" size={20} /></span><div><strong>#{order._id.slice(-8).toUpperCase()}</strong><small>{order.items.map(item => `${productText(item)} × ${item.qty}`).join(', ')}</small><time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString(language === 'gu' ? 'gu-IN' : 'en-IN')}</time></div><div className="account-order-total"><strong>{new Intl.NumberFormat(language === 'gu' ? 'gu-IN' : 'en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(order.totalAmount)}</strong><span className={'tag ' + order.orderStatus}>{tr(order.orderStatus)}</span></div><Icon name="arrow" size={16} /></Link>)}
    </section>
    <section className="account-panel" id="account-details"><div className="account-panel-heading"><div><span className="eyebrow">{tr('MADE PERSONAL')}</span><h2>{tr('Profile & delivery details')}</h2></div><Icon name="user" /></div><p className="account-form-note">{tr('Your saved details are filled in automatically at checkout. You can change them for each order.')}</p><form onSubmit={save}><fieldset disabled={busy}><label>{tr('Email')}<input type="email" value={user.email} readOnly /></label><div className="account-form-grid"><label>{tr('Name')}<input required maxLength={120} autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>{tr('Phone')}<input type="tel" maxLength={30} autoComplete="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label></div><label id="delivery-address">{tr('Delivery address')}<textarea ref={addressField} maxLength={1000} rows={4} autoComplete="street-address" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></label>{error && <p className="err" role="alert">{tr(error)}</p>}{message && <p className="ok" role="status">{tr(message)}</p>}<button type="submit">{tr(busy ? 'Saving…' : 'Save account details')}<Icon name="check" size={18} /></button></fieldset></form></section>
    <AccountSecurity /></div></div>
  </div>;
}

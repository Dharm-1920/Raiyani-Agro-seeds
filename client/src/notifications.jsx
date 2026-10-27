import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context';
import api from './api';
import { tr, useLanguage } from './language.jsx';

const Context = createContext();
export const useNotifications = () => useContext(Context);
const empty = { items: [], unread: 0, subscriptions: [], menuCounts: {}, pages: 0, page: 1 };
export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const account = user?.id;
  const owner = useRef(account); owner.current = account;
  const sequence = useRef(0);
  const [state, setState] = useState({ ...empty, owner: null });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const currentPage = useRef(1);
  const refresh = async (page = currentPage.current) => {
    const id = owner.current, request = ++sequence.current;
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get('/notifications', { params: { page } });
      if (owner.current !== id || sequence.current !== request) return;
      currentPage.current = page; setState({ ...data, owner: id }); setError('');
    } catch {
      if (owner.current === id && sequence.current === request) setError('Notifications could not be loaded. Please retry.');
    } finally { if (owner.current === id && sequence.current === request) setLoading(false); }
  };
  useEffect(() => {
    sequence.current++; currentPage.current = 1; setState({ ...empty, owner: account }); setError(''); setLoading(false);
    if (!account) return;
    refresh(1);
    const visibleRefresh = () => { if (document.visibilityState === 'visible') refresh(); };
    const timer = setInterval(visibleRefresh, 15000);
    window.addEventListener('focus', visibleRefresh);
    document.addEventListener('visibilitychange', visibleRefresh);
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener('focus', visibleRefresh); document.removeEventListener('visibilitychange', visibleRefresh); };
  }, [account]);
  const write = async (method, path, data = {}) => {
    const id = owner.current;
    if (!id) throw Error('Please sign in again.');
    await api.request({ method, url: '/notifications' + path, data: { ...data, accountId: id } });
    if (owner.current !== id) throw Error('Your account changed. Please try again.');
    await refresh();
  };
  return <Context.Provider value={{ ...(state.owner === account ? state : empty), loading, error, refresh, write }}>{children}</Context.Provider>;
}
function BellIcon() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}
export function NotificationBell() {
  const { user } = useAuth();
  const { unread } = useNotifications();
  useLanguage();
  if (!user) return null;
  return <Link className="notification-bell" to="/notifications" aria-label={`${tr('Notifications')}${unread ? ` (${unread} ${tr('unread')})` : ''}`} title={tr('Notifications')}><BellIcon />{unread > 0 && <span className="notification-count">{unread > 99 ? '99+' : unread}</span>}</Link>;
}
export function NotifyButton({ product }) {
  const { subscriptions, write, error: loadError, refresh } = useNotifications();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const subscribed = subscriptions.includes(product._id);
  useLanguage();
  const toggle = async () => {
    setBusy(true); setError('');
    try { await write(subscribed ? 'delete' : 'post', `/subscriptions/${product._id}`); }
    catch (e) { setError(e.response?.status === 409 ? 'This product is already in stock. Refresh the shop to order it.' : 'Could not update your alert. Please retry.'); }
    finally { setBusy(false); }
  };
  return <div className="restock-action"><span className="out">{tr('Out of stock')}</span>
    <button type="button" className={'notify-button' + (subscribed ? ' subscribed' : '')} disabled={busy || Boolean(loadError)} onClick={toggle} aria-pressed={subscribed}><BellIcon />{tr(busy ? 'Saving…' : subscribed ? 'Cancel alert' : 'Notify')}</button>
    {subscribed && <small role="status">{tr('We’ll notify you when it’s back in stock.')}</small>}
    {error && <small className="err" role="alert">{tr(error)}</small>}
    {loadError && <button type="button" className="link" onClick={() => refresh()}>{tr('Retry alerts')}</button>}
  </div>;
}
export function NotificationsPage() {
  const { items, unread, pages, page, loading, error, refresh, write } = useNotifications();
  const { user } = useAuth();
  const { language } = useLanguage();
  const [actionError, setActionError] = useState(''), [busy, setBusy] = useState(false);
  const mark = async id => {
    setBusy(true); setActionError('');
    try { await write('put', id ? `/${id}/read` : '/read-all'); }
    catch { setActionError('Could not mark notifications as read. Please retry.'); }
    finally { setBusy(false); }
  };
  return <section className="notifications-page">
    <div className="notifications-heading"><div><span className="eyebrow">{tr('YOUR UPDATES')}</span><h1>{tr('Notifications')}</h1><p>{tr('Restock alerts and order updates, all in one place.')}</p></div><button className="secondary" disabled={!unread || busy} onClick={() => mark()}>{tr('Mark all as read')}</button></div>
    {user?.role === 'admin' && <Link className="link" to="/admin?tab=Orders">{tr('Back to admin orders')} →</Link>}
    {(error || actionError) && <p className="err" role="alert">{tr(error || actionError)} {error && <button className="link" onClick={() => refresh()}>{tr('Retry')}</button>}</p>}
    {loading && !items.length && <p role="status">{tr('Loading…')}</p>}
    {!loading && !error && !items.length && <div className="notifications-empty"><BellIcon /><h2>{tr('You’re all caught up')}</h2><p>{tr('Request an alert on an out-of-stock product. Your updates will appear here.')}</p><Link className="btn" to="/shop">{tr('Browse products')}</Link></div>}
    <div className="notification-list">{items.map(item => <article key={item._id} className={'notification-item' + (item.isRead ? '' : ' is-unread')}>
      <span className="notification-symbol"><BellIcon /></span><div><h2>{language === 'gu' ? item.titleGu || item.title : item.title}</h2><p>{language === 'gu' ? item.messageGu || item.message : item.message}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(language === 'gu' ? 'gu-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time><div className="notification-actions"><Link to={item.link} onClick={() => { if (!item.isRead) mark(item._id); }}>{tr(item.type === 'restock' ? 'View product' : 'View orders')} →</Link>{!item.isRead && <button className="link" disabled={busy} onClick={() => mark(item._id)}>{tr('Mark as read')}</button>}</div></div>{!item.isRead && <span className="unread-dot" aria-label={tr('unread')} />}
    </article>)}</div>
    {pages > 1 && <div className="notification-pagination"><button className="secondary" disabled={page <= 1 || loading} onClick={() => refresh(page - 1)}>{tr('Previous')}</button><span>{page} / {pages}</span><button className="secondary" disabled={page >= pages || loading} onClick={() => refresh(page + 1)}>{tr('Next')}</button></div>}
    <p className="notification-note">{tr('Alerts appear here while you use the website. Updates refresh automatically.')}</p>
  </section>;
}

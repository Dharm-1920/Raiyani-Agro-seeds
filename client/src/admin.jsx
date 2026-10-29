import AdminTable from './admin-table';
import { tr, productText } from "./language.jsx";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import api, { errMsg } from './api';
import { rs } from './pages';
import { useAuth } from './context';
import Icon from './icons';
import { Brand, LanguageSelector } from './language.jsx';
import { SHOP } from './config';
import InvoiceButton from './invoice.jsx';
import PaymentStatus from './payment-status.jsx';
import CounterBills from './counter-bills.jsx';
import Bookkeeping from './bookkeeping.jsx';
import AccountBook from './account-book.jsx';
import CounterCustomers from './counter-customers.jsx';
import { refundText } from './payment.jsx';
import './admin.css';
import { NotificationBell, useNotifications } from './notifications.jsx';
const STATUSES = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const empty = {
  name: '',
  category: 'Seeds',
  price: '',
  mrp: '',
  unit: 'pack',
  stock: '',
  description: '',
  nameGu: '',
  descriptionGu: '',
  categoryGu: '',
  unitGu: ''
};
function useData(url, initial) {
  const [data, setData] = useState(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const id = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const r = await api.get(url);
      if (id === sequence.current) setData(r.data);
    } catch (e) {
      if (id === sequence.current) setError(errMsg(e));
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  return {
    data,
    loading,
    error,
    load
  };
}
function State({
  resource,
  children
}) {
  if (resource.loading) return <p className="admin-empty" role="status">{tr("Loading your shop data\u2026")}</p>;
  if (resource.error) return <div className="admin-empty" role="alert"><p>{tr(resource.error)}</p><button onClick={resource.load}>{tr("Try again")}</button></div>;
  return children;
}
function Empty({
  children
}) {
  return <p className="admin-empty">{tr(children)}</p>;
}
export function AdminLogin() {
  const {
      user,
      ready,
      adminLogin
    } = useAuth(),
    nav = useNavigate();
  const [form, setForm] = useState({
      email: '',
      password: ''
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (ready && user?.role === 'admin') return <Navigate to="/admin" replace />;
  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminLogin(form);
      nav('/admin', {
        replace: true
      });
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return <div className="admin-login"><aside><Link to="/" className="admin-logo"><Brand large /></Link><span className="eyebrow">{tr("THE PEOPLE BEHIND THE HARVEST")}</span><h1>{tr("Your shop.")}<br />{tr("All in one place.")}</h1><p>{tr("Manage your stock, follow every order and stay close to your customers.")}</p><div className="admin-login-perks"><span><Icon name="bag" />{tr(" Products & inventory")}</span><span><Icon name="truck" />{tr(" Orders & delivery")}</span><span><Icon name="user" />{tr(" Customers & messages")}</span></div></aside><div className="admin-login-form"><form onSubmit={submit}><div className="admin-mobile-brand"><Brand /></div><LanguageSelector /><span className="admin-lock"><Icon name="shield" size={30} /></span><span className="eyebrow">{tr("STORE MANAGEMENT")}</span><h2>{tr("Admin sign in")}</h2><p>{tr("Use your administrator account to continue.")}</p>{tr(user && user.role !== 'admin' && <p className="admin-notice">{tr("Your current account is a customer account. Sign in with an administrator account below.")}</p>)}<label>{tr("Email address")}<input type="email" autoComplete="username" required value={form.email} onChange={e => setForm({
            ...form,
            email: e.target.value
          })} /></label><label>{tr("Password")}<input type="password" autoComplete="current-password" required value={form.password} onChange={e => setForm({
            ...form,
            password: e.target.value
          })} /></label><p><Link to="/forgot-password">{tr('Forgot password?')}</Link></p>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}<button disabled={busy}>{tr(busy ? 'Signing in…' : 'Open admin panel')}<Icon name="arrow" size={18} /></button><Link className="back-to-shop" to="/">{tr("\u2190 Back to the shop")}</Link></form></div></div>;
}
function Dashboard({
  open
}) {
  const resource = useData('/admin/stats', null),
    s = resource.data;
  return <State resource={resource}>{tr(s && <><PaymentStatus/><div className="admin-kpis">{tr([['Revenue', rs(s.revenue), 'Delivered COD & paid orders', 'sun'], ['Orders', s.orders, 'All customer orders', 'bag'], ['Customers', s.users, 'Registered shoppers', 'user'], ['Products', s.products, 'Active products in your shop', 'leaf']].map(([title, value, description, icon]) => <div key={title}><span><small>{tr(title)}</small><Icon name={icon} /></span><b>{tr(value)}</b><p>{tr(description)}</p></div>))}</div><div className="admin-quick"><div><h3>{tr("Make room for your next harvest.")}</h3><p>{tr("Keep your catalogue and stock up to date.")}</p></div><button onClick={() => open('Products')}>{tr("Manage products ")}<Icon name="arrow" size={18} /></button></div><div className="admin-panels"><section><h3>{tr("Order overview")}</h3>{tr(s.byStatus.length ? STATUSES.map(status => {
            const count = s.byStatus.find(x => x._id === status)?.n || 0;
            return <div className="status-meter" key={status}><span>{tr(status)}<b>{tr(count)}</b></span><div><i style={{
                  width: `${s.orders ? count / s.orders * 100 : 0}%`
                }} /></div></div>;
          }) : <Empty>{tr("No orders yet.")}</Empty>)}</section><section><h3>{tr("Popular products")}</h3>{tr(s.top.length ? s.top.map((x, i) => <div className="admin-list" key={x._id}><span className="rank">{tr(i + 1)}</span><span>{tr(x._id)}</span><b>{tr(x.qty)}{tr(" sold")}</b></div>) : <Empty>{tr("Sales will appear here.")}</Empty>)}</section><section><h3>{tr("Stock needs attention ")}<span className="mini-badge">{tr(s.lowStock.length)}</span></h3>{tr(s.lowStock.length ? s.lowStock.map(x => <div className="admin-list" key={x._id}><span>{productText(x)}</span><b className="low-stock">{tr(x.stock)}{tr(" left")}</b></div>) : <Empty>{tr("No products with stock of 5 or less.")}</Empty>)}<button className="link" onClick={() => open('Products')}>{tr("Update inventory \u2192")}</button></section></div></>)}</State>;
}
function Products() {
  const resource = useData('/products?all=1&limit=100', {
    items: []
  });
  const [form, setForm] = useState(empty),
    [editId, setEditId] = useState(null),
    [files, setFiles] = useState([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState('');
  const formRef = useRef(null);
  const translate = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data } = await api.post('/products/translate', form);
      setForm(current => ({ ...current, ...data }));
      setNotice('Gujarati translations are ready. Review them before saving.');
    } catch (error) { setError(errMsg(error)); }
    finally { setBusy(false); }
  };
  const reset = () => {
    setForm(empty);
    setEditId(null);
    setFiles([]);
    formRef.current?.reset();
  };
  const save = async e => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (files.length > 5 || files.some(f => f.size > 2 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) return setError('Choose up to 5 JPG, PNG or WebP images, each 2MB or smaller.');
    setBusy(true);
    const fd = new FormData();
    Object.entries(form).forEach(([key, value]) => fd.append(key, value));
    files.forEach(file => fd.append('images', file));
    try {
      editId ? await api.put('/products/' + editId, fd) : await api.post('/products', fd);
      setNotice(editId ? 'Product updated.' : 'Product added to your shop.');
      reset();
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const edit = p => {
    setEditId(p._id);
    setForm(Object.fromEntries(Object.keys(empty).map(k => [k, p[k] ?? empty[k]])));
    setFiles([]);
    formRef.current?.reset();
    formRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  };
  const toggle = async p => {
    setError('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('isActive', !p.isActive);
      await api.put('/products/' + p._id, fd);
      setNotice(p.isActive ? 'Product hidden from the shop.' : 'Product is now visible in the shop.');
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async p => {
    if (!confirm(tr('Remove product confirmation').replace('{name}',productText(p)))) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api.delete('/products/' + p._id);
      if (editId === p._id) reset();
      setNotice('Product removed from your catalogue and shop.');
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  const input = (key, label, type = 'text', required = true) => <label>{tr(label)}<input type={type} required={required} min={type === 'number' ? 0 : undefined} step={key === 'stock' ? 1 : type === 'number' ? '0.01' : undefined} value={form[key]} onChange={e => setForm({
      ...form,
      [key]: e.target.value,
      ...(['name', 'description', 'category', 'unit'].includes(key) ? { [key + 'Gu']: '' } : {})
    })} /></label>;
  const list = resource.data.items.filter(p => `${p.name} ${p.nameGu || ""} ${p.category} ${p.categoryGu || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <><form ref={formRef} className="admin-panel product-editor" onSubmit={save}><div className="admin-section-title"><h3>{tr(editId ? 'Edit product' : 'Add a product')}</h3><span className="mini-badge">{tr("Inventory")}</span></div><fieldset disabled={busy}><div className="formgrid">{tr(input('name', 'Product name'))}{tr(input('category', 'Category'))}{tr(input('unit', 'Unit / pack size'))}{tr(input('price', 'Selling price (₹)', 'number'))}{tr(input('mrp', 'MRP (₹)', 'number', false))}{tr(input('stock', 'Stock quantity', 'number'))}</div><label>{tr("Description")}<textarea rows="3" value={form.description} onChange={e => setForm({
            ...form,
            description: e.target.value, descriptionGu: ""
          })} /></label><details className="product-translations"><summary>{tr("Gujarati product details")}</summary><p>{tr("Gujarati text is generated when you save. You can review or enter it here.")}</p><div className="formgrid">{input('nameGu','Gujarati product name','text',false)}{input('categoryGu','Gujarati category','text',false)}{input('unitGu','Gujarati unit / pack size','text',false)}</div><label>{tr("Gujarati description")}<textarea lang="gu" rows="3" value={form.descriptionGu} onChange={e=>setForm({...form,descriptionGu:e.target.value})}/></label><button type="button" className="secondary" disabled={busy || !form.name.trim()} onClick={translate}>{tr(busy?'Please wait…':'Generate Gujarati')}</button></details><label className="upload-area"><Icon name="bag" />{tr(" Product photos ")}<small>{tr("Up to 5 photos \xB7 JPG, PNG, WebP \xB7 2MB each")}</small><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => setFiles(Array.from(e.target.files))} /></label>{tr(editId && <p className="muted">{tr("Upload new photos to replace existing photos, or leave this blank to keep them.")}</p>)}<div className="editor-actions"><button>{tr(busy ? 'Saving…' : editId ? 'Save changes' : 'Add product')}</button>{tr(editId && <button type="button" className="secondary" onClick={reset}>{tr("Cancel edit")}</button>)}</div></fieldset></form>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}{tr(notice && <p className="ok" role="status">{tr(notice)}</p>)}<section className="admin-panel"><div className="admin-section-title"><h3>{tr("Product catalogue ")}<span className="mini-badge">{tr(resource.data.items.length)}</span></h3><input aria-label={tr("Search inventory")} placeholder={tr("Search inventory…")} value={search} onChange={e => setSearch(e.target.value)} /></div><State resource={resource}>{tr(list.length ? <AdminTable label="Product catalogue" mobileCards numericColumns={[1,2]} minWidth={720}><thead><tr><th>{tr("Product")}</th><th>{tr("Price")}</th><th>{tr("Stock")}</th><th>{tr("Visibility")}</th><th>{tr("Actions")}</th></tr></thead><tbody>{tr(list.map(p => <tr key={p._id}><td><b>{productText(p)}</b><small>{productText(p, "category")} · {productText(p, "unit")}</small></td><td>{tr(rs(p.price))}</td><td><span className={p.stock <= 5 ? 'low-stock' : ''}>{tr(p.stock)}</span></td><td><span className={'tag ' + (p.isActive ? 'delivered' : 'cancelled')}>{tr(p.isActive ? 'Live' : 'Hidden')}</span></td><td><button className="link" disabled={busy} onClick={() => edit(p)}>{tr("Edit")}</button><button className="link" disabled={busy} onClick={() => toggle(p)}>{tr(p.isActive ? 'Hide' : 'Show')}</button><button className="link danger" disabled={busy} onClick={() => remove(p)}>{tr("Remove")}</button></td></tr>))}</tbody></AdminTable> : <Empty>{tr("No products match your search. Add your first product above.")}</Empty>)}</State><p className="muted">{tr("Showing up to 100 products. Hide keeps a product in your inventory for later. Remove takes it out of the catalogue and shop while preserving existing orders.")}</p></section></>;
}
function Orders() {
  const notifications = useNotifications();
  const [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const resource = useData('/admin/orders?status=' + encodeURIComponent(status), []);
  useEffect(() => {
    if (!resource.loading && !resource.error && resource.data.length) {
      notifications.write('put', '/read-purchases', { orderIds: resource.data.map(order => order._id) }).catch(e => setError(errMsg(e)));
    }
  }, [resource.data, resource.loading, resource.error]);
  const change = async (id, orderStatus) => {
    setError('');
    setBusy(id);
    try {
      await api.put(`/admin/orders/${id}/status`, {
        orderStatus
      });
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const confirmPayment = async order => {
    const reference = prompt(tr('Verify the credit and full order amount in your bank account first. Enter the bank-verified 12-digit UPI reference:'), order.paymentReference || '');
    if (!reference) return;
    setError('');
    setBusy(order._id);
    try {
      await api.post(`/admin/orders/${order._id}/payment-confirm`, {
        reference
      });
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const confirmRefund = async order => {
    const reference = prompt(tr('Send the full refund first. Enter its completed bank transaction reference:'));
    if (!reference) return;
    setError('');
    setBusy(order._id);
    try {
      await api.post(`/admin/orders/${order._id}/refund-confirm`, {
        reference
      });
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const cancel = async order => {
    if (!confirm(tr('Cancel this order and restore its stock?' + (order.paymentStatus === 'paid' ? ' Arrange its refund after checking your bank account.' : '')))) return;
    setError('');
    setBusy(order._id);
    try {
      await api.put(`/admin/orders/${order._id}/cancel`);
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  return <section className="admin-panel"><div className="admin-section-title"><h3>{tr("Customer orders")}</h3><select aria-label={tr("Filter orders by status")} value={status} onChange={e => setStatus(e.target.value)}><option value="">{tr("All statuses")}</option>{tr(STATUSES.map(s => <option key={s} value={s}>{tr(s)}</option>))}</select></div>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}<State resource={resource}>{tr(resource.data.length ? <AdminTable label="Customer orders" className="admin-orders-table" mobileCards numericColumns={[3]} minWidth={980}><thead><tr><th>{tr("Order")}</th><th>{tr("Customer")}</th><th>{tr("Items")}</th><th>{tr("Total")}</th><th>{tr("Payment")}</th><th>{tr("Status")}</th><th>{tr("Invoice")}</th></tr></thead><tbody>{tr(resource.data.map(o => <tr key={o._id}><td><b>#{tr(o._id.slice(-8).toUpperCase())}</b><small>{tr(new Date(o.createdAt).toLocaleDateString('en-IN'))}</small></td><td>{o.shipping?.name}<small>{o.shipping?.phone}<br />{o.shipping?.address}</small></td><td>{tr(o.items.map((i, k) => <div key={k}>{i.name} × {tr(i.qty)}</div>))}</td><td>{tr(rs(o.totalAmount))}</td><td><span className={'tag admin-payment-tag is-' + o.paymentStatus}>{tr(o.paymentMethod === 'upi' ? 'UPI QR' : o.paymentMethod === 'cod' ? 'COD' : 'Online')} · {tr(o.paymentStatus)}</span>{tr(refundText(o) && <small>{tr(refundText(o))}</small>)}{tr(o.paymentReference && <small>{tr("Submitted UTR: ")}{o.paymentReference}</small>)}{tr(o.paymentMethod === 'upi' && ['pending', 'failed'].includes(o.paymentStatus) && ['placed', 'confirmed', 'cancelled'].includes(o.orderStatus) && <button className="link" disabled={Boolean(busy)} onClick={() => confirmPayment(o)}>{tr("Confirm bank payment")}</button>)}{tr(o.orderStatus === 'cancelled' && o.paymentStatus === 'paid' && <button className="link" disabled={Boolean(busy)} onClick={() => confirmRefund(o)}>{tr("Record completed refund")}</button>)}{tr(o.transactionId && <><small>{tr("Payment: ")}{o.transactionId}</small></>)}</td><td><select aria-label={'Status for order ' + o._id.slice(-8)} value={o.orderStatus} disabled={busy === o._id || o.orderStatus === 'cancelled' || o.orderStatus === 'delivered'} onChange={e => {
                if (e.target.value !== 'cancelled' || confirm(tr('Cancel this order and return its items to stock?'))) change(o._id, e.target.value);
              }}>{tr(STATUSES.filter(s => s !== 'cancelled' || o.orderStatus === 'cancelled').map(s => <option key={s} value={s}>{tr(s)}</option>))}</select>{tr((['placed', 'confirmed'].includes(o.orderStatus) || o.orderStatus === 'cancelled' && o.cancelledAt && o.stockRestored === false) && <button className="link danger" disabled={Boolean(busy)} onClick={() => cancel(o)}>{tr(o.orderStatus === 'cancelled' ? 'Complete cancellation' : 'Cancel order')}</button>)}{tr(o.cancelledBy && <small>{tr("Cancelled by ")}{tr(o.cancelledBy)}</small>)}</td><td><InvoiceButton orderId={o._id} compact/></td></tr>))}</tbody></AdminTable> : <Empty>{tr("No orders for this status.")}</Empty>)}</State><p className="muted">{tr("Showing the latest 200 matching orders. Cancel before shipment. Delivered and cancelled orders are final. Verify QR payments in your bank account. Paid cancellations need a manual refund; record it only after sending it.")}</p></section>;
}
function Users() {
  const resource = useData('/admin/users', []),
    {
      user
    } = useAuth();
  const [search, setSearch] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const act = async (id, fn) => {
    setBusy(id);
    setError('');
    try {
      await fn();
      await resource.load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  const list = resource.data.filter(u => `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="admin-panel"><div className="admin-section-title"><h3>{tr("Customers & administrators")}</h3><input aria-label={tr("Search customers")} placeholder={tr("Search name or email…")} value={search} onChange={e => setSearch(e.target.value)} /></div>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}<State resource={resource}>{tr(list.length ? <AdminTable label="Customers & administrators" mobileCards minWidth={640}><thead><tr><th>{tr("Customer")}</th><th>{tr("Phone")}</th><th>{tr("Role")}</th><th>{tr("Actions")}</th></tr></thead><tbody>{tr(list.map(u => <tr key={u._id}><td><b>{u.name}</b><small>{u.email}</small></td><td>{tr(u.phone || '—')}</td><td><span className={'tag is-' + u.role}>{tr(u.role === 'admin' ? 'Administrator' : 'Customer')}</span></td><td>{tr(u._id === user.id ? <span className="muted">{tr("Your account")}</span> : <div className="admin-row-actions"><button disabled={busy === u._id} className="link" onClick={() => {
                  if (confirm(tr('Change role confirmation').replace('{name}',u.name).replace('{role}',tr(u.role === 'admin' ? 'customer' : 'admin')))) act(u._id, () => api.put(`/admin/users/${u._id}/role`, {
                    role: u.role === 'admin' ? 'user' : 'admin'
                  }));
                }}>{tr("Make ")}{tr(u.role === 'admin' ? 'customer' : 'admin')}</button><button disabled={busy === u._id} className="link danger" onClick={() => {
                  if (confirm(tr('Delete account confirmation').replace('{name}',u.name))) act(u._id, () => api.delete('/admin/users/' + u._id));
                }}>{tr("Delete")}</button></div>)}</td></tr>))}</tbody></AdminTable> : <Empty>{tr("No customers match your search.")}</Empty>)}</State></section>;
}
function Messages() {
  const notifications = useNotifications();
  const resource = useData('/admin/messages', []),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const act = async (id, fn) => {
    setBusy(id);
    setError('');
    try {
      await fn();
      await resource.load();
      await notifications.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  return <section className="admin-panel"><div className="admin-section-title"><h3>{tr("Customer messages")}</h3><span className="mini-badge">{tr(resource.data.filter(m => !m.isRead).length)}{tr(" unread")}</span></div>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}<State resource={resource}>{tr(resource.data.length ? resource.data.map(m => <article className={'admin-message ' + (m.isRead ? 'read' : '')} key={m._id}><div className="admin-section-title"><div><b>{m.name}</b><a href={'mailto:' + m.email}>{m.email}</a></div><span className="tag">{tr(m.isRead ? 'Read' : 'New')}</span></div><p>{m.message}</p><small>{tr(new Date(m.createdAt).toLocaleString('en-IN'))}</small><div>{tr(!m.isRead && <button disabled={busy === m._id} className="link" onClick={() => act(m._id, () => api.put(`/admin/messages/${m._id}/read`))}>{tr("Mark read")}</button>)}<button disabled={busy === m._id} className="link danger" onClick={() => {
            if (confirm(tr('Delete this message?'))) act(m._id, () => api.delete('/admin/messages/' + m._id));
          }}>{tr("Delete")}</button></div></article>) : <Empty>{tr("Your inbox is clear. Messages from the contact form will appear here.")}</Empty>)}</State></section>;
}
const TABS = {
  Dashboard,
  Products,
  Orders,
  'Counter bills': CounterBills,
  Bookkeeping,
  'Account book': AccountBook,
  'Counter customers': CounterCustomers,
  Users,
  Messages
};
const icons = {
  Dashboard: 'sun',
  Products: 'leaf',
  Orders: 'bag',
  'Counter bills': 'bag',
  Bookkeeping: 'menu',
  'Account book': 'menu',
  'Counter customers': 'user',
  Users: 'user',
  Messages: 'menu'
};
const descriptions = {
  Dashboard: 'A clear view of your shop, from stock to sales.',
  Products: 'Your seeds, farm essentials and inventory.',
  Orders: 'Follow each order from checkout to delivery.',
  'Counter bills': 'Make, print and share bills for customers at your shop.',
  Bookkeeping: 'Counter sales, customer dues, receipts and shop expenses.',
  'Account book': 'Day book, account ledgers, opening balances and accounting entries.',
  'Counter customers': 'Saved customer details and individual customer statements.',
  Users: 'Manage customer accounts and store access.',
  Messages: 'Keep in touch with the people who grow with you.'
};
export default function Admin() {
  const { menuCounts = {} } = useNotifications();
  const location = useLocation();
  const requestedTab = new URLSearchParams(location.search).get('tab');
  const [tab, setTab] = useState(TABS[requestedTab] ? requestedTab : 'Dashboard'),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState('');
  const {
      user,
      logout
    } = useAuth(),
    nav = useNavigate(),
    View = TABS[tab];
  useEffect(() => { if (TABS[requestedTab]) setTab(requestedTab); }, [requestedTab]);
  const openTab = value => {
    setTab(value);
    nav('/admin?tab=' + encodeURIComponent(value));
  };
  const leave = async () => {
    try {
      await logout();
      nav('/admin/login');
    } catch (e) {
      setError(errMsg(e));
    }
  };
  return <div className="admin-shell"><aside className="admin-sidebar"><Link to="/" className="admin-logo"><Brand /></Link><span className="sidebar-label">{tr("WORKSPACE")}</span><nav aria-label={tr("Admin sections")}>{tr(Object.keys(TABS).map(t => <button key={t} className={tab === t ? 'active' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => openTab(t)}><Icon name={icons[t]} size={19} /><span>{tr(t)}</span>{menuCounts[t] > 0 && <span className="admin-unread-count" aria-label={`${menuCounts[t]} ${tr("unread")}`}>{menuCounts[t] > 99 ? "99+" : menuCounts[t]}</span>}</button>))}</nav><div className="sidebar-bottom"><Link to="/"><Icon name="arrow" size={18} />{tr(" View storefront")}</Link><button onClick={leave}>{tr("Sign out")}</button></div></aside><div className="admin-workspace"><header className="admin-topbar"><LanguageSelector /><span>{tr("Raiyani Agro Seeds ")}<small>{tr("/ Admin panel")}</small></span><NotificationBell /><span className="admin-profile"><i>{tr(user.name.charAt(0).toUpperCase())}</i><span>{user.name}<small>{tr("Administrator")}</small></span></span></header><div className="admin-content"><div className="admin-title"><div><span className="eyebrow">{tr("YOUR SHOP AT A GLANCE")}</span><h1>{tr(tab)}</h1><p>{tr(descriptions[tab])}</p></div><button className="secondary" onClick={() => setRefresh(n => n + 1)}>{tr("Refresh data")}</button></div>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}<View key={tab + refresh} open={openTab} /><p className="admin-bottom-note">{tr(SHOP.name)} · {tr(SHOP.city)}</p></div></div></div>;
}

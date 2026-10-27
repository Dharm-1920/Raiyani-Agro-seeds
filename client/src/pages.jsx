import { WhyChooseUs, ShopDetails, FAQs, WixIntroduction, ProductIntroduction } from './business.jsx';
import { tr, productText } from "./language.jsx";
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import api, { errMsg } from './api';
import { useAuth, useCart } from './context';
import { SHOP } from './config';
import Icon from './icons';
import ProductArt from './ProductArt';
import { AccountProfile } from './profile.jsx';
import { NotifyButton } from './notifications.jsx';
import { Brand, LanguageSelector } from './language.jsx';
import InvoiceButton from './invoice.jsx';
import { PaymentQR, paymentError, refundText } from './payment.jsx';
export const rs = n => '₹' + Number(n || 0).toLocaleString('en-IN');
export function Img({
  p
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p.images?.[0]]);
  return p.images?.[0] && !failed ? <img src={p.images[0]} alt={productText(p)} loading="lazy" onError={() => setFailed(true)} /> : <div className={'ph ph-' + (p.category || '').toLowerCase()}><ProductArt category={p.category} /><span>{tr("Category illustration")}</span></div>;
}
function Card({
  p
}) {
  const {
    add,
    ready: cartReady
  } = useCart();
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (added) {
      const t = setTimeout(() => setAdded(false), 1800);
      return () => clearTimeout(t);
    }
  }, [added]);
  return <div className="card">
      <Link to={`/product/${p._id}`}><div className="product-image"><Img p={p} />{tr(p.mrp > p.price && <span className="discount">{tr(Math.round((1 - p.price / p.mrp) * 100))}{tr("% off")}</span>)}</div><h3>{productText(p)}</h3></Link>
      <p className="muted"><span className="category-label">{productText(p, "category")}</span> · {productText(p, "unit")}</p>
      <p><b>{tr(rs(p.price))}</b> {tr(p.mrp > p.price && <s className="muted">{tr(rs(p.mrp))}</s>)}</p>
      {tr(p.stock > 0 ? <><button className="add-button" disabled={!cartReady} onClick={() => {
        add(p);
        setAdded(true);
      }}><Icon name={added ? "check" : "bag"} size={17} />{tr(added ? "Added to cart" : "Add to cart")}</button><span className="sr-only" role="status">{tr(added ? `${productText(p)} added to cart` : "")}</span></> : <NotifyButton product={p} />)}
    </div>;
}
const categories = [['Seeds', 'leaf', 'Start with the right seed', '01'], ['Fertilizers', 'sun', 'Nourish every root', '02'], ['Pesticides', 'shield', 'Protect what you grow', '03'], ['Tools', 'tool', 'Make every day easier', '04']];
export function Home() {
  const [items, setItems] = useState([]),
    [state, setState] = useState('loading');
  useEffect(() => {
    let alive = true;
    api.get('/products?limit=4').then(r => {
      if (alive) {
        setItems(r.data.items);
        setState('ready');
      }
    }).catch(() => {
      if (alive) setState('error');
    });
    return () => {
      alive = false;
    };
  }, []);
  return <>
    <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="dot" />{tr("ROOTED IN GONDAL")}</span><h1>{tr("Good things")}<br />{tr("start with")}<br /><em>{tr("good seeds.")}</em></h1><p>{tr(SHOP.tagline)}{tr(". Explore essentials that help you grow, season after season.")}</p><div className="hero-actions"><Link className="btn" to="/shop">{tr("Shop farm essentials")}<Icon name="arrow" size={18} /></Link><Link className="text-link" to="/our-story">{tr("Our story")}<Icon name="arrow" size={16} /></Link></div><div className="hero-trust"><span><Icon name="check" size={14} />{tr("Quality Agro Products")}</span><span><Icon name="check" size={14} />{tr("Guidance for growers")}</span></div></div><div className="hero-visual"><img className="hero-photo" src="/assets/farm-sunrise.png" alt={tr("Green farm landscape")} loading="eager" /><span className="hero-seal"><Icon name="leaf" size={25} /><span>{tr("GROW SOMETHING REAL")}</span></span><div className="harvest-note"><span><Icon name="leaf" size={25} /></span><div><small>{tr("FOR THE NEXT GENERATION OF GROWERS")}</small><b>{tr("A better harvest begins here.")}</b></div></div><span className="hero-photo-caption">{tr("Rooted in ")}{tr(SHOP.city)}</span></div></section>
    <div className="benefits">{tr([['leaf', 'Farm essentials', 'Seeds, nutrition & protection'], ['truck', 'Delivered to your door', 'Free delivery from ₹500'], ['pin', 'Shop local', 'Visit us in Gondal']].map(([icon, title, text]) => <div key={title}><Icon name={icon} size={27} /><span><b>{tr(title)}</b><small>{tr(text)}</small></span></div>))}</div>
    <section className="section"><div className="section-head"><div><span className="eyebrow">{tr("EVERYTHING FOR YOUR FARM")}</span><h2>{tr("A little of everything.")}<br />{tr("For everything you grow.")}</h2></div><Link className="text-link" to="/shop">{tr("Browse all ")}<Icon name="arrow" size={18} /></Link></div><div className="categories">{tr(categories.map(([name, icon, text, number]) => <Link key={name} to={'/shop?category=' + name} className={'category category-' + name.toLowerCase()}><div className="category-top"><span>{tr("SHOP BY CATEGORY")}</span><span>{tr(number)}</span></div><img className="category-photo" src={"/assets/wix/" + ({Seeds:"products-2.png",Fertilizers:"products-4.png",Pesticides:"products-1.png",Tools:"products-3.png"})[name]} alt={tr(name)} loading="lazy" /><h3>{tr(name)}</h3><p>{tr(text)}</p><span className="category-arrow"><Icon name="arrow" size={19} /></span></Link>))}</div></section>
    <section className="section"><div className="section-head"><div><span className="eyebrow">{tr("EXPLORE OUR RANGE")}</span><h2>{tr("Ready for your next season")}</h2></div><Link className="text-link" to="/shop">{tr("Shop all products ")}<Icon name="arrow" size={18} /></Link></div>{tr(state === 'loading' ? <div className="grid" aria-label={tr("Loading products")}>{tr([1, 2, 3, 4].map(n => <div key={n} className="skeleton" />))}</div> : state === 'error' ? <div className="empty-state"><Icon name="leaf" size={32} /><h3>{tr("We couldn\u2019t load the products")}</h3><p>{tr("Please try the shop again shortly, or contact us for help.")}</p><Link className="btn" to="/shop">{tr("Open shop")}</Link></div> : items.length ? <div className="grid">{tr(items.map(p => <Card key={p._id} p={p} />))}</div> : <div className="empty-state"><h3>{tr("Our shelves are getting ready")}</h3><p>{tr("Contact us for current product availability.")}</p><Link to="/contact">{tr("Get in touch \u2197")}</Link></div>)}</section>
    <WixIntroduction />
    <WhyChooseUs />
    <section className="about-banner"><span className="eyebrow">{tr("A LOCAL SHOP. A SHARED PURPOSE.")}</span><h2>{tr("Behind every harvest,")}<br />{tr("there\u2019s a little care.")}</h2><p>{tr("At ")}{tr(SHOP.name)}{tr(", we bring seeds and farm inputs together in one place. Shop online or visit us in Gondal to find what you need for your next season.")}</p><Link className="btn light" to="/about">{tr("Meet your farming partner ")}<Icon name="arrow" size={18} /></Link><Icon size={200} className="about-leaf" /></section>
    <section className="section"><div className="section-head"><div><span className="eyebrow">{tr("COME SAY HELLO")}</span><h2>{tr("Your local agro shop")}</h2></div></div><div className="visit"><div><Icon name="pin" size={30} /><h3>{tr(SHOP.name)}</h3><ShopDetails /><a className="btn" href={SHOP.mapsUrl} target="_blank" rel="noreferrer">{tr("Get directions ")}<Icon name="arrow" size={18} /></a></div><iframe title={tr("Shop location")} loading="lazy" src={`https://maps.google.com/maps?q=${SHOP.lat},${SHOP.lng}&z=16&output=embed`} /></div></section>
  </>;
}
export function Shop() {
  const [data, setData] = useState({
    items: [],
    categories: [],
    pages: 1
  });
  const loc = useLocation();
  const [f, setF] = useState({
    search: new URLSearchParams(loc.search).get('search') || '',
    category: new URLSearchParams(loc.search).get('category') || '',
    sort: 'new',
    page: 1
  });
  const [error, setError] = useState('');
  useEffect(() => setF(s => ({
    ...s,
    search: new URLSearchParams(loc.search).get('search') || '',
    category: new URLSearchParams(loc.search).get('category') || '',
    page: 1
  })), [loc.search]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    let active = true;
    setError('');
    const t = setTimeout(() => api.get('/products', {
      params: {
        ...f,
        limit: 12
      }
    }).then(r => {
      if (active) setData(r.data);
    }).catch(() => {
      if (active) setError('Products could not be loaded. Please try again shortly.');
    }).finally(() => {
      if (active) setLoading(false);
    }), 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [f]);
  const set = (k, v) => setF(s => ({
    ...s,
    [k]: v,
    page: k === 'page' ? v : 1
  }));
  return <>
      <div className="page-heading"><span className="eyebrow">{tr("THE RAIYANI SHOP")}</span><h1>{tr("Grow something good.")}</h1><p>{tr("Seeds, soil nutrition and the tools for a better season.")}</p></div>
      <ProductIntroduction />
      <div className="shop-chips">{tr(['All products', ...categories.map(c => c[0])].map(c => <button key={c} className={(f.category || 'All products') === c ? 'selected' : ''} onClick={() => set('category', c === 'All products' ? '' : c)}>{tr(c)}</button>))}</div>
      <div className="bar">
        <input aria-label={tr("Search products")} placeholder={tr("Search products…")} value={f.search} onChange={e => set('search', e.target.value)} />
        <select aria-label={tr("Product category")} value={f.category} onChange={e => set('category', e.target.value)}>
          <option value="">{tr("All categories")}</option>{tr([...new Set([...categories.map(c => c[0]), ...data.categories])].map(c => <option key={c} value={c}>{tr(c)}</option>))}
        </select>
        <select aria-label={tr("Sort products")} value={f.sort} onChange={e => set('sort', e.target.value)}>
          <option value="new">{tr("Newest")}</option><option value="price_asc">{tr("Price: low to high")}</option><option value="price_desc">{tr("Price: high to low")}</option>
        </select>
      </div>
      {tr(loading ? <p className="center">{tr("Loading\u2026")}</p> : error ? <p className="empty-state" role="alert">{tr(error)}</p> : data.items.length ? <div className="grid">{tr(data.items.map(p => <Card key={p._id} p={p} />))}</div> : <p className="center">{tr("No products found.")}</p>)}
      {tr(data.pages > 1 && <div className="pager">
        <button disabled={f.page <= 1} onClick={() => set('page', f.page - 1)}>{tr("Prev")}</button><span>{tr("Page ")}{tr(f.page)}{tr(" of ")}{tr(data.pages)}</span>
        <button disabled={f.page >= data.pages} onClick={() => set('page', f.page + 1)}>{tr("Next")}</button></div>)}
    </>;
}
export function Product() {
  const {
      id
    } = useParams(),
    {
      add,
      ready: cartReady
    } = useCart(),
    [p, setP] = useState(null),
    [qty, setQty] = useState(1),
    [msg, setMsg] = useState('');
  useEffect(() => {
    api.get('/products/' + id).then(r => setP(r.data)).catch(() => setMsg('Product not found'));
  }, [id]);
  if (msg) return <p className="center">{tr(msg)}</p>;
  if (!p) return <p className="center">{tr("Loading\u2026")}</p>;
  return <><div className="breadcrumbs"><Link to="/shop">{tr("Shop")}</Link><span>/</span><span>{productText(p, "category")}</span><span>/</span><span>{productText(p)}</span></div><div className="detail"><Img p={p} />
      <div><h1>{productText(p)}</h1><p className="muted">{productText(p, "category")} · {productText(p, "unit")}</p>
        <p className="big">{tr(rs(p.price))} {tr(p.mrp > p.price && <s className="muted">{tr(rs(p.mrp))}</s>)}</p><p>{productText(p, "description")}</p>
        {tr(p.stock > 0 ? <><p className="muted">{tr(p.stock)}{tr(" in stock")}</p>
          <input type="number" min="1" max={p.stock} value={qty} onChange={e => setQty(Math.max(1, Math.min(+e.target.value || 1, p.stock)))} style={{
            width: 80
          }} />{tr(' ')}
          <button disabled={!cartReady} onClick={() => {
            add(p, qty);
            setMsg('');
          }}>{tr("Add to cart")}</button></> : <NotifyButton product={p} />)}<div className="product-perks"><span><Icon name="truck" size={18} />{tr(" Free delivery from \u20B9500")}</span><span><Icon name="pin" size={18} />{tr(" Your local Gondal shop")}</span></div></div></div></>;
}
export function Cart() {
  const {
    items,
    setQty,
    remove,
    total,
    ready: cartReady,
    saving
  } = useCart();
  if (!cartReady) return <p className="center">{tr("Loading your account cart\u2026")}</p>;
  if (!items.length) return <p className="center">{tr("Your cart is empty. ")}<Link to="/shop">{tr("Browse products")}</Link></p>;
  return <div className="box"><h1>{tr("Your cart")}</h1><p className="muted" role="status">{tr(saving ? 'Saving your cart…' : 'Your cart is saved to your account.')}</p>
      {tr(items.map(i => <div className="row" key={i.id}><span>{productText(i)}</span>
          <input type="number" min="1" max={i.stock} value={i.qty} onChange={e => setQty(i.id, +e.target.value || 1)} style={{
        width: 70
      }} />
          <b>{tr(rs(i.price * i.qty))}</b><button className="link" onClick={() => remove(i.id)}>{tr("Remove")}</button></div>))}
      <p className="big">{tr("Subtotal: ")}{tr(rs(total))}</p><p className="muted">{tr("Shipping is calculated at checkout (free on orders \u20B9500 and above).")}</p>
      <Link className="btn" to="/checkout">{tr("Checkout")}</Link></div>;
}
export function Checkout() {
  const {
      user,
      updateProfile
    } = useAuth(),
    {
      items,
      total,
      clear,
      ready: cartReady,
      flush
    } = useCart(),
    nav = useNavigate();
  const [saveAddress, setSaveAddress] = useState(true);
  const [shipping, setShipping] = useState({
    name: user.name,
    phone: user.phone || '',
    address: user.address || ''
  });
  const [method, setMethod] = useState('cod'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [options, setOptions] = useState(null);
  useEffect(() => {
    api.get('/payments/options').then(r => setOptions(r.data)).catch(() => setOptions({
      upi: false,
      unavailable: true
    }));
  }, []);
  const fee = total >= 500 ? 0 : 40;
  const place = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    let created;
    try {
      await flush();
      if (saveAddress) await updateProfile(shipping);
      const {
        data
      } = await api.post('/orders', {
        accountId: user.id,
        items: items.map(i => ({
          productId: i.id,
          qty: i.qty
        })),
        shipping,
        paymentMethod: method
      });
      created = data.order;
      clear();
      nav('/orders', {
        state: {
          placed: created._id,
          qrOrder: method === 'upi' ? created._id : null
        }
      });
    } catch (e) {
      if (created) {
        clear();
        nav('/orders', {
          state: {
            paymentMessage: paymentError(e),
            placed: created._id
          }
        });
      } else {
        setError(paymentError(e));
        setBusy(false);
      }
    }
  };
  if (!cartReady) return <p className="center">{tr("Loading your account cart\u2026")}</p>;
  if (!items.length) return <p className="center">{tr("Your cart is empty. ")}<Link to="/shop">{tr("Browse products")}</Link></p>;
  return <form className="box" onSubmit={place}><h1>{tr("Checkout")}</h1><label>{tr("Name")}<input required autoComplete="name" value={shipping.name} onChange={e => setShipping({
        ...shipping,
        name: e.target.value
      })} /></label><label>{tr("Phone")}<input required type="tel" autoComplete="tel" pattern="[0-9+ ]{10,14}" value={shipping.phone} onChange={e => setShipping({
        ...shipping,
        phone: e.target.value
      })} /></label><label>{tr("Delivery address")}<textarea required autoComplete="street-address" rows="3" value={shipping.address} onChange={e => setShipping({
        ...shipping,
        address: e.target.value
      })} /></label><label className="save-address"><input type="checkbox" checked={saveAddress} onChange={e => setSaveAddress(e.target.checked)} />{tr(" Save these delivery details to my account")}</label><h3>{tr("Choose payment")}</h3><div className="payment-choices"><label className={method === 'cod' ? 'selected' : ''}><input type="radio" name="payment" checked={method === 'cod'} onChange={() => setMethod('cod')} /><span><b>{tr("Cash on Delivery")}</b><small>{tr("Pay when your order arrives")}</small></span></label><label className={method === 'upi' ? 'selected' : ''}><input type="radio" name="payment" checked={method === 'upi'} disabled={!options?.upi} onChange={() => setMethod('upi')} /><span><b>{tr("UPI QR payment")}</b><small>{tr("Scan and pay with your UPI app")}</small></span></label></div>{tr(!options ? <p className="muted">{tr("Checking payment options\u2026")}</p> : !options.upi ? <p className="muted">{tr(options.unavailable ? 'Payment options could not be checked. Please try again later.' : 'The shop’s receiving UPI account is not configured. Contact the shop or use Cash on Delivery.')}</p> : null)}<div className="checkout-total"><span>{tr("Items ")}{tr(rs(total))}{tr(" + shipping ")}{tr(rs(fee))}</span><b>{tr(rs(total + fee))}</b></div>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}<button disabled={busy}>{tr(busy ? 'Please wait…' : method === 'upi' ? 'Place order & show QR' : 'Place order')}</button></form>;
}
export function MyOrders() {
  const loc = useLocation();
  const [qrOrder, setQrOrder] = useState(loc.state?.qrOrder || null);
  const [orders, setOrders] = useState(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(loc.state?.paymentMessage || ''),
    [busy, setBusy] = useState('');
  const load = async () => {
    try {
      setOrders((await api.get('/orders/my')).data);
    } catch (e) {
      setError(errMsg(e));
    }
  };
  useEffect(() => {
    load();
  }, []);
  const cancel = async order => {
    if (!confirm(tr((order.orderStatus === 'cancelled' ? 'Complete cancellation and stock restoration?' : 'Cancel this order?') + (order.paymentStatus === 'paid' ? ' Your payment will need a refund review by the shop.' : '')))) return;
    setBusy(order._id);
    setError('');
    setMessage('');
    try {
      await api.put(`/orders/${order._id}/cancel`);
      if (qrOrder === order._id) setQrOrder(null);
      setMessage('Order cancelled.');
      await load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy('');
    }
  };
  return <div className="box wide"><div className="orders-heading"><h1>{tr("My orders")}</h1><button className="secondary" disabled={Boolean(busy)} onClick={() => {
        setError('');
        load();
      }}>{tr("Refresh orders")}</button></div>{tr(qrOrder && <PaymentQR orderId={qrOrder} onClose={() => setQrOrder(null)} onSubmitted={load} />)} {tr(loc.state?.placed && !loc.state?.paymentMessage && <p className="ok">{tr("Thank you! Your order was placed.")}</p>)}{tr(message && <p className="payment-note" role="status">{tr(message)}</p>)}{tr(error && <p className="err" role="alert">{tr(error)}</p>)}{tr(!orders ? <p className="center">{tr(error ? 'Could not load orders. Use Refresh orders to retry.' : 'Loading…')}</p> : !orders.length ? <p>{tr("No orders yet. ")}<Link to="/shop">{tr("Browse the shop")}</Link></p> : orders.map(o => <div className="order" key={o._id}><div className="row"><b>#{tr(o._id.slice(-8).toUpperCase())}</b><span>{tr(new Date(o.createdAt).toLocaleDateString('en-IN'))}</span><span className={'tag ' + o.orderStatus}>{tr(o.orderStatus)}</span><span className="tag">{tr(o.paymentMethod === 'upi' ? 'UPI QR' : o.paymentMethod === 'cod' ? 'COD' : 'Online')} · {tr(o.paymentStatus)}</span><b>{tr(rs(o.totalAmount))}</b></div><ul>{tr(o.items.map((i, k) => <li key={k}>{productText(i)} × {tr(i.qty)}</li>))}</ul>{tr(refundText(o) && <p className="payment-note">{tr(refundText(o))}</p>)}{tr(o.paymentReference && <p className="muted">{tr("UPI reference: ")}{o.paymentReference}{tr(o.paymentStatus === 'pending' ? ' · Awaiting shop verification' : '')}</p>)}{tr(o.cancelledBy && <p className="muted">{tr("Cancelled by ")}{tr(o.cancelledBy === 'admin' ? 'the shop' : 'you')}.</p>)}<div className="order-actions"><InvoiceButton orderId={o._id}/>{tr(o.paymentMethod === 'upi' && ['pending', 'failed'].includes(o.paymentStatus) && ['placed', 'confirmed'].includes(o.orderStatus) && <button disabled={Boolean(busy)} onClick={() => setQrOrder(o._id)}>{tr("Show payment QR")}</button>)}{tr((['placed', 'confirmed'].includes(o.orderStatus) || o.orderStatus === 'cancelled' && o.cancelledAt && o.stockRestored === false) && <button className="cancel-button" disabled={Boolean(busy)} onClick={() => cancel(o)}>{tr(busy === o._id ? 'Please wait…' : o.orderStatus === 'cancelled' ? 'Complete cancellation' : 'Cancel order')}</button>)}</div></div>))}</div>;
}
function AuthForm({
  register
}) {
  const {
      login,
      register: reg
    } = useAuth(),
    nav = useNavigate(),
    loc = useLocation();
  const [f, setF] = useState({
      name: '',
      email: '',
      password: '',
      phone: '',
      address: ''
    }),
    [err, setErr] = useState('');
  const submit = async e => {
    e.preventDefault();
    setErr('');
    try {
      register ? await reg(f) : await login(f);
      nav(loc.state?.from || '/', {
        replace: true
      });
    } catch (x) {
      setErr(errMsg(x));
    }
  };
  const inp = (k, label, type = 'text', req = true) => <label>{tr(label)}<input type={type} required={req} minLength={k === 'password' ? 6 : undefined} value={f[k]} onChange={e => setF({
      ...f,
      [k]: e.target.value
    })} /></label>;
  return <form className="box narrow customer-auth" onSubmit={submit}><Link to="/login" className="auth-brand"><Brand large /></Link><LanguageSelector /><span className="eyebrow">{tr("YOUR FARMING ACCOUNT")}</span><h1>{tr(register ? 'Create account' : 'Login')}</h1><p>{tr("Sign in to browse, save your cart and manage your orders.")}</p>
      {tr(register && inp('name', 'Full name'))}{tr(inp('email', 'Email', 'email'))}{tr(inp('password', 'Password', 'password'))}
      {tr(register && <>{tr(inp('phone', 'Phone', 'tel', false))}{tr(inp('address', 'Delivery address', 'text', false))}</>)}
      {tr(err && <p className="err">{tr(err)}</p>)}<button>{tr(register ? 'Sign up' : 'Login')}</button>
      <p>{tr(register ? <>{tr("Have an account? ")}<Link to="/login">{tr("Login")}</Link></> : <>{tr("New here? ")}<Link to="/register">{tr("Create account")}</Link></>)}</p><Link className="text-link" to="/admin/login">{tr("Administrator sign in \u2192")}</Link></form>;
}
export const Login = () => <AuthForm />;
export const Register = () => <AuthForm register />;
export function Account() { const { user } = useAuth(); return <AccountProfile key={user.id} />; }
export function Contact() {
  const [f, setF] = useState({
      name: '',
      email: '',
      message: ''
    }),
    [st, setSt] = useState('');
  const send = async e => {
    e.preventDefault();
    try {
      await api.post('/contact', f);
      setSt('ok');
      setF({
        name: '',
        email: '',
        message: ''
      });
    } catch (x) {
      setSt(errMsg(x));
    }
  };
  return <><div className="page-heading"><span className="eyebrow">{tr('LET’S TALK GROWING')}</span><h1>{tr('Contact us')}</h1><p>{tr('Visit, call or send us a message. We’re here to help.')}</p></div>
    <div className="contact-layout"><section className="contact-info"><h2>{tr(SHOP.name)}</h2><ShopDetails /><a className="btn" href={SHOP.mapsUrl} target="_blank" rel="noreferrer">{tr('Get directions')}</a><iframe className="contact-map" title={tr('Shop location')} loading="lazy" src={`https://maps.google.com/maps?q=${SHOP.lat},${SHOP.lng}&z=16&output=embed`} /></section>
    <form className="box narrow" onSubmit={send}><h2>{tr('Send us a message')}</h2>
      <label>{tr("Name")}<input required value={f.name} onChange={e => setF({
        ...f,
        name: e.target.value
      })} /></label>
      <label>{tr("Email")}<input type="email" required value={f.email} onChange={e => setF({
        ...f,
        email: e.target.value
      })} /></label>
      <label>{tr("Message")}<textarea required rows="4" value={f.message} onChange={e => setF({
        ...f,
        message: e.target.value
      })} /></label>
      {tr(st === 'ok' ? <p className="ok">{tr("Message sent. We will get back to you.")}</p> : st && <p className="err">{tr(st)}</p>)}<button>{tr("Send")}</button></form></div><FAQs /></>;
}

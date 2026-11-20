import AddressBook from './address-book.jsx';
import { WhyChooseUs, ShopDetails, FAQs, WixIntroduction, ProductIntroduction } from './business.jsx';
import { tr, productText, useLanguage } from "./language.jsx";
import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import api, { errMsg } from './api';
import { useAuth, useCart } from './context';
import { SHOP } from './config';
import Icon from './icons';
import ProductArt from './ProductArt';
import { AccountProfile } from './profile.jsx';
import { NotifyButton } from './notifications.jsx';

import InvoiceButton, { InvoicePreferences } from './invoice.jsx';
import { PaymentQR, paymentError, refundText } from './payment.jsx';
import { ProductPurchase, QuantityControl } from './purchase.jsx';
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
  return <div className="card">
      <Link to={`/product/${p._id}`}><div className="product-image"><Img p={p} />{tr(p.mrp > p.price && <span className="discount">{tr(Math.round((1 - p.price / p.mrp) * 100))}{tr("% off")}</span>)}</div><h3>{productText(p)}</h3></Link>
      <p className="muted"><span className="category-label">{productText(p, "category")}</span> · {productText(p, "unit")}</p>
      <p><b>{tr(rs(p.price))}</b> {tr(p.mrp > p.price && <s className="muted">{tr(rs(p.mrp))}</s>)}</p>
      {p.stock > 0 ? <ProductPurchase key={p._id} product={p} compact /> : <NotifyButton product={p} />}
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
    <section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="dot" />{tr("ROOTED IN GONDAL")}</span><h1>{tr("Good things")}<br />{tr("start with")}<br /><em>{tr("good seeds.")}</em></h1><p>{tr(SHOP.tagline)}{tr(". Explore essentials that help you grow, season after season.")}</p><div className="hero-actions"><Link className="btn" to="/shop">{tr("Shop farm essentials")}<Icon name="arrow" size={18} /></Link><Link className="text-link" to="/our-story">{tr("Our story")}<Icon name="arrow" size={16} /></Link></div><div className="hero-trust"><span><Icon name="check" size={14} />{tr("Quality Agro Products")}</span><span><Icon name="check" size={14} />{tr("Guidance for growers")}</span></div></div><div className="hero-visual"><img className="hero-photo" src="/assets/farm-sunrise.webp" alt={tr("Green farm landscape")} loading="eager" /><span className="hero-seal"><Icon name="leaf" size={25} /><span>{tr("GROW SOMETHING REAL")}</span></span><div className="harvest-note"><span><Icon name="leaf" size={25} /></span><div><small>{tr("FOR THE NEXT GENERATION OF GROWERS")}</small><b>{tr("A better harvest begins here.")}</b></div></div><span className="hero-photo-caption">{tr("Rooted in ")}{tr(SHOP.city)}</span></div></section>
    <div className="benefits">{tr([['leaf', 'Farm essentials', 'Seeds, nutrition & protection'], ['truck', 'Delivered to your door', 'Free delivery from ₹500'], ['pin', 'Shop local', 'Visit us in Gondal']].map(([icon, title, text]) => <div key={title}><Icon name={icon} size={27} /><span><b>{tr(title)}</b><small>{tr(text)}</small></span></div>))}</div>
    <section className="section"><div className="section-head"><div><span className="eyebrow">{tr("EVERYTHING FOR YOUR FARM")}</span><h2>{tr("A little of everything.")}<br />{tr("For everything you grow.")}</h2></div><Link className="text-link" to="/shop">{tr("Browse all ")}<Icon name="arrow" size={18} /></Link></div><div className="categories">{tr(categories.map(([name, icon, text, number]) => <Link key={name} to={'/shop?category=' + name} className={'category category-' + name.toLowerCase()}><div className="category-top"><span>{tr("SHOP BY CATEGORY")}</span><span>{tr(number)}</span></div><img className="category-photo" src={"/assets/wix/" + ({Seeds:"products-2.webp",Fertilizers:"products-4.webp",Pesticides:"products-1.webp",Tools:"products-3.webp"})[name]} alt={tr(name)} loading="lazy" /><h3>{tr(name)}</h3><p>{tr(text)}</p><span className="category-arrow"><Icon name="arrow" size={19} /></span></Link>))}</div></section>
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
  const navigate = useNavigate();
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
      {tr(loading ? <div className="grid" aria-label={tr("Loading products")} aria-busy="true">{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <div key={n} className="skeleton" />)}</div> : error ? <p className="empty-state" role="alert">{tr(error)}</p> : data.items.length ? <div className="grid">{tr(data.items.map(p => <Card key={p._id} p={p} />))}</div> : <div className="empty-state"><Icon name="search" size={30} /><h3>{tr("No products found.")}</h3><p>{tr("Try a different word, or ask us on WhatsApp and we will help you find it.")}</p>{(f.search || f.category) && <button type="button" className="btn" onClick={() => { setF(s => ({ ...s, search: '', category: '', page: 1 })); if (loc.search) navigate('/shop'); }}>{tr("Clear filters")}</button>}</div>)}
      {tr(data.pages > 1 && <div className="pager">
        <button disabled={f.page <= 1} onClick={() => set('page', f.page - 1)}>{tr("Prev")}</button><span>{tr("Page ")}{tr(f.page)}{tr(" of ")}{tr(data.pages)}</span>
        <button disabled={f.page >= data.pages} onClick={() => set('page', f.page + 1)}>{tr("Next")}</button></div>)}
    </>;
}
export function Product() {
  const {
      id
    } = useParams(),
    [p, setP] = useState(null),
    [msg, setMsg] = useState('');
  useEffect(() => {
    let active = true;
    setP(null); setMsg('');
    api.get('/products/' + id).then(r => { if (active) setP(r.data); }).catch(() => { if (active) setMsg('Product not found'); });
    return () => { active = false; };
  }, [id]);
  const { language } = useLanguage();
  useEffect(() => {
    if (p) document.title = `${productText(p)} | ${language === 'gu' ? 'રૈયાણી એગ્રો સીડ્સ, ગોંડલ' : 'Raiyani Agro Seeds, Gondal'}`;
  }, [p, language]);
  if (msg) return <p className="center">{tr(msg)}</p>;
  if (!p) return <div className="detail" aria-busy="true" aria-label={tr("Loading\u2026")}><div className="skeleton product-skeleton" /><div className="skeleton product-skeleton short" /></div>;
  const askText = `${tr("Hello")} ${SHOP.name}, ${tr("I want to know more about")}: ${productText(p)} (${productText(p, "unit")}) - ${window.location.href}`;
  return <><div className="breadcrumbs"><Link to="/shop">{tr("Shop")}</Link><span>/</span><span>{productText(p, "category")}</span><span>/</span><span>{productText(p)}</span></div><div className="detail"><Img p={p} />
      <div><h1>{productText(p)}</h1><p className="muted">{productText(p, "category")} · {productText(p, "unit")}</p>
        <p className="big">{tr(rs(p.price))} {tr(p.mrp > p.price && <s className="muted">{tr(rs(p.mrp))}</s>)}</p><p>{productText(p, "description")}</p>
        {p.stock > 0 ? <><p className={'stock-status' + (p.stock <= 5 ? ' low' : '')}>{tr(p.stock <= 5 ? 'Only a few left' : 'In stock')}</p><ProductPurchase key={p._id} product={p} /></> : <NotifyButton product={p} />}<div className="product-perks"><span><Icon name="truck" size={18} />{tr(" Free delivery from \u20B9500")}</span><span><Icon name="pin" size={18} />{tr(" Your local Gondal shop")}</span></div><a className="whatsapp-ask" href={`https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(askText)}`} target="_blank" rel="noreferrer"><WhatsAppMark />{tr("Ask about this product on WhatsApp")}</a></div></div><RelatedProducts product={p} /></>;
}
function WhatsAppMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>;
}
function RelatedProducts({ product }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let active = true;
    setItems([]);
    api.get('/products', { params: { category: product.category, limit: 5 } }).then(r => {
      if (active) setItems((r.data.items || []).filter(item => item._id !== product._id).slice(0, 4));
    }).catch(() => {});
    return () => { active = false; };
  }, [product._id, product.category]);
  if (!items.length) return null;
  return <section className="section related-products"><div className="section-head"><div><span className="eyebrow">{tr("MORE FROM THIS CATEGORY")}</span><h2>{tr("You may also like")}</h2></div><Link className="text-link" to={'/shop?category=' + encodeURIComponent(product.category)}>{tr("See all ")}<Icon name="arrow" size={18} /></Link></div><div className="grid">{tr(items.map(item => <Card key={item._id} p={item} />))}</div></section>;
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
  const { language } = useLanguage();
  if (!cartReady) return <div className="cart-page" aria-busy="true" aria-label={tr("Loading your account cart…")}><div className="skeleton cart-skeleton" /><div className="skeleton cart-skeleton short" /></div>;
  if (!items.length) return <div className="empty-state cart-empty"><Icon name="bag" size={40} /><h2>{tr("Your cart is empty")}</h2><p>{tr("Find seeds, fertilizers and tools for your next season.")}</p><Link className="btn" to="/shop">{tr("Browse products")}<Icon name="arrow" size={18} /></Link></div>;
  const fee = deliveryFee(total), remaining = FREE_DELIVERY_FROM - total;
  return <div className="cart-page">
    <section className="cart-items"><div className="cart-title"><h1>{tr("Your cart")}</h1><p className="muted" role="status">{tr(saving ? 'Saving your cart…' : 'Your cart is saved to your account.')}</p></div>
      <div className={'delivery-progress' + (remaining <= 0 ? ' done' : '')}><p><Icon name="truck" size={18} /><span>{remaining > 0 ? (language === 'gu' ? <>મફત ડિલિવરી માટે <b>{rs(remaining)}</b> ની વધુ ખરીદી કરો</> : <>Add <b>{rs(remaining)}</b> more for free delivery</>) : tr("You have unlocked free delivery!")}</span></p><span className="delivery-bar" aria-hidden="true"><i style={{ width: Math.min(100, total / FREE_DELIVERY_FROM * 100) + '%' }} /></span></div>
      {items.map(i => <article className="cart-line" key={i.id}>
        <Link to={'/product/' + i.id} className="cart-thumb" tabIndex={-1} aria-hidden="true">{i.image ? <img src={i.image} alt="" loading="lazy" /> : <Icon name="leaf" size={28} />}</Link>
        <div className="cart-line-info"><Link to={'/product/' + i.id} className="cart-item-name">{productText(i)}</Link><span className="muted">{tr(rs(i.price))} {tr("each")}</span>{!i.stock && <span className="tag cancelled">{tr("Out of stock")}</span>}</div>
        <QuantityControl value={i.qty} max={i.stock} disabled={!i.stock} onChange={qty => setQty(i.id, qty)} name={productText(i)} />
        <b className="cart-line-total">{tr(rs(i.price * i.qty))}</b>
        <button type="button" className="cart-remove" onClick={() => remove(i.id)} aria-label={`${tr("Remove")} ${productText(i)}`} title={tr("Remove")}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg></button>
      </article>)}
      <Link className="text-link cart-continue" to="/shop">← {tr("Continue shopping")}</Link>
    </section>
    <aside className="cart-summary" aria-label={tr("Order summary")}><h2>{tr("Order summary")}</h2>
      <p><span>{tr("Subtotal")}</span><span>{tr(rs(total))}</span></p>
      <p><span>{tr("Delivery")}</span><span>{fee ? tr(rs(fee)) : <b className="free">{tr("Free")}</b>}</span></p>
      <p className="cart-summary-total"><span>{tr("Total")}</span><b>{tr(rs(total + fee))}</b></p>
      <Link className="btn" to="/checkout">{tr("Checkout")}<Icon name="arrow" size={18} /></Link>
      <small><Icon name="check" size={14} />{tr("Cash on Delivery or UPI payment")}</small>
      <small><Icon name="pin" size={14} />{tr("Your local Gondal shop")}</small>
    </aside>
  </div>;
}
const FREE_DELIVERY_FROM = 500;
const deliveryFee = total => total >= FREE_DELIVERY_FROM ? 0 : 40;
export function Checkout() {
  const { language } = useLanguage();
  const location = useLocation();
  const [invoiceWhatsApp, setInvoiceWhatsApp] = useState(false);
  const {
      user
    } = useAuth(),
    {
      items: cartItems,
      total: cartTotal,
      clear,
      ready: cartReady,
      flush
    } = useCart(),
    nav = useNavigate();
  const purchase = location.state?.buyNow;
  const invalidPurchase = Boolean(purchase && (purchase.accountId !== user.id || !purchase.item || typeof purchase.item.id !== 'string' || !Number.isInteger(purchase.item.qty) || purchase.item.qty < 1 || purchase.item.qty > 10000 || !Number.isFinite(purchase.item.price) || purchase.item.price < 0));
  const directPurchase = purchase && !invalidPurchase ? purchase.item : null;
  const items = directPurchase ? [directPurchase] : cartItems;
  const total = directPurchase ? directPurchase.price * directPurchase.qty : cartTotal;
  const [delivery, setDelivery] = useState(null);
  const shipping = delivery ? { name: delivery.name, phone: delivery.phone, address: delivery.address } : { name: '', phone: '', address: '' };
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
  const fee = deliveryFee(total);
  const place = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    let created;
    try {
      if (!directPurchase) await flush();
      if (!delivery) throw Error('Choose a delivery address before placing your order.');
      const {
        data
      } = await api.post('/orders', {
        accountId: user.id,
        items: items.map(i => ({
          productId: i.id,
          qty: i.qty
        })),
        shipping,
        addressId: delivery._id,
        addressBookVersion: delivery.version,
        paymentMethod: method,
        invoiceWhatsApp,
        invoiceLanguage: language
      });
      created = data.order;
      if (!directPurchase) clear();
      nav('/orders', {
        state: {
          placed: created._id,
          qrOrder: method === 'upi' ? created._id : null
        }
      });
    } catch (e) {
      if (created) {
        if (!directPurchase) clear();
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
  if (invalidPurchase) return <p className="center" role="alert">{tr('Choose this product again to continue with your current account.')} <Link to="/shop">{tr('Browse products')}</Link></p>;
  if (!directPurchase && !cartReady) return <p className="center">{tr("Loading your account cart\u2026")}</p>;
  if (!items.length) return <p className="center">{tr("Your cart is empty. ")}<Link to="/shop">{tr("Browse products")}</Link></p>;
  return <form className="box" onSubmit={place}><h1>{tr("Checkout")}</h1><section className="checkout-items" aria-label={tr('Order summary')}>{items.map(item => <div className="checkout-item" key={item.id}><span>{productText(item)} × {tr(item.qty)}</span><b>{tr(rs(item.price * item.qty))}</b></div>)}{directPurchase && <p className="muted">{tr('Your saved cart stays unchanged.')}</p>}</section><AddressBook checkout onSelect={setDelivery} /><InvoicePreferences user={user} phone={shipping.phone} whatsapp={invoiceWhatsApp} setWhatsapp={setInvoiceWhatsApp} /><h3>{tr("Choose payment")}</h3><div className="payment-choices"><label className={method === 'cod' ? 'selected' : ''}><input type="radio" name="payment" checked={method === 'cod'} onChange={() => setMethod('cod')} /><span><b>{tr("Cash on Delivery")}</b><small>{tr("Pay when your order arrives")}</small></span></label><label className={method === 'upi' ? 'selected' : ''}><input type="radio" name="payment" checked={method === 'upi'} disabled={!options?.upi} onChange={() => setMethod('upi')} /><span><b>{tr("UPI QR payment")}</b><small>{tr("Scan and pay with your UPI app")}</small></span></label></div>{tr(!options ? <p className="muted">{tr("Checking payment options\u2026")}</p> : !options.upi ? <p className="muted">{tr(options.unavailable ? 'Payment options could not be checked. Please try again later.' : 'The shop’s receiving UPI account is not configured. Contact the shop or use Cash on Delivery.')}</p> : null)}<div className="checkout-total"><span>{tr("Items ")}{tr(rs(total))}{tr(" + shipping ")}{tr(rs(fee))}</span><b>{tr(rs(total + fee))}</b></div>{tr(error && <p className="err" role="alert">{tr(error)}</p>)}<button disabled={busy || !delivery}>{tr(busy ? 'Please wait…' : method === 'upi' ? 'Place order & show QR' : 'Place order')}</button></form>;
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
export function Account() { const { user } = useAuth(); return <AccountProfile key={user.id} />; }
export function Contact() {
  const { user } = useAuth();
  const blank = () => ({ name: user?.name || '', contact: user?.phone || user?.email || '', message: '' });
  const [f, setF] = useState(blank),
    [st, setSt] = useState('');
  const send = async e => {
    e.preventDefault();
    try {
      await api.post('/contact', f);
      setSt('ok');
      setF(blank());
    } catch (x) {
      setSt(errMsg(x));
    }
  };
  return <><div className="page-heading"><span className="eyebrow">{tr('LET’S TALK GROWING')}</span><h1>{tr('Contact us')}</h1><p>{tr('Visit, call or send us a message. We’re here to help.')}</p></div>
    <div className="contact-layout"><section className="contact-info"><h2>{tr(SHOP.name)}</h2><div className="contact-quick"><a className="contact-quick-whatsapp" href={`https://wa.me/${SHOP.whatsapp}?text=${encodeURIComponent(tr("Hello") + " " + SHOP.name)}`} target="_blank" rel="noreferrer"><WhatsAppMark /><span><b>{tr("Chat on WhatsApp")}</b><small>{tr("Quick answers about products and orders")}</small></span></a><a className="contact-quick-call" href={"tel:" + SHOP.phone.replace(/\s/g, "")}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-3 2a12 12 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z" /></svg><span><b>{tr("Call the shop")}</b><small>{SHOP.phone}</small></span></a></div><ShopDetails /><a className="btn" href={SHOP.mapsUrl} target="_blank" rel="noreferrer">{tr('Get directions')}</a><iframe className="contact-map" title={tr('Shop location')} loading="lazy" src={`https://maps.google.com/maps?q=${SHOP.lat},${SHOP.lng}&z=16&output=embed`} /></section>
    {!user ? <div className="box narrow guest-contact-note"><h2>{tr('Send us a message')}</h2><p>{tr('Sign in to send us a message, or reach us on WhatsApp or phone.')}</p><Link className="btn" to="/login" state={{ from: '/contact' }}>{tr('Sign in')}<Icon name="arrow" size={18} /></Link></div> : <form className="box narrow" onSubmit={send}><h2>{tr('Send us a message')}</h2>
      <label>{tr("Name")}<input required value={f.name} onChange={e => setF({
        ...f,
        name: e.target.value
      })} /></label>
      <label>{tr("Phone or email")}<input required autoComplete="tel" inputMode="text" placeholder="+91 98765 43210" value={f.contact} onChange={e => setF({
        ...f,
        contact: e.target.value
      })} /><small className="muted">{tr("We will reply by phone, WhatsApp or email.")}</small></label>
      <label>{tr("Message")}<textarea required rows="4" value={f.message} onChange={e => setF({
        ...f,
        message: e.target.value
      })} /></label>
      {tr(st === 'ok' ? <p className="ok">{tr("Message sent. We will get back to you.")}</p> : st && <p className="err">{tr(st)}</p>)}<button>{tr("Send")}</button></form>}</div><FAQs /></>;
}

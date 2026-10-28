import { About, ShopDetails, Story, Team, Blog, BlogPost, Welcome } from './business.jsx';
import { tr } from "./language.jsx";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useCart } from './context';
import { SHOP } from './config';
import { Home, Shop, Product, Cart, Checkout, MyOrders, Contact, Account } from './pages';
import Admin, { AdminLogin } from './admin';
import { useEffect, useState } from 'react';
import Icon from './icons';
import { animatePage } from './motion';
import { NotificationBell, NotificationsPage } from './notifications.jsx';
import { ProfileMenu } from './profile.jsx';
import { Brand, LanguageSelector, useLanguage } from './language.jsx';
import { CustomerAuth, ForgotPassword, ResetPassword, VerifyEmail, PrivacyPolicy } from './auth.jsx';
function Guard({
  admin,
  children
}) {
  const {
      user,
      ready
    } = useAuth(),
    loc = useLocation();
  if (!ready) return <p className="center">{tr("Loading\u2026")}</p>;
  if (!user) return <Navigate to={admin ? "/admin/login" : "/login"} state={{
    from: loc.pathname
  }} replace />;
  if (admin && user.role !== 'admin') return <Navigate to="/admin/login" replace />;
  return children;
}
export default function App() {
  useLanguage();
  const {
      user,
      ready
    } = useAuth(),
    {
      count,
      error: cartError,
      retry: retryCart
    } = useCart();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    setMenu(false);
    if (!loc.hash) window.scrollTo(0, 0);
  }, [loc.pathname, loc.search, loc.hash]);
  useEffect(() => {
    if (!menu) return;
    const close = event => {
      if (event.key === 'Escape') {
        setMenu(false);
        document.querySelector('.menu-button')?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menu]);
  useEffect(() => {
    if (!ready) return;
    const animation = animatePage();
    return () => animation?.cancel();
  }, [loc.pathname, ready]);
  const adminArea = loc.pathname.startsWith('/admin');
  const authArea = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email', '/privacy'].includes(loc.pathname);
  const coverArea = ['/', '/welcome'].includes(loc.pathname);
  const showStore = Boolean(user) && !adminArea && !authArea && !coverArea;
  if (!ready) return <p className="center" role="status">{tr("Checking your account\u2026")}</p>;
  return <>
      {tr(showStore && <>
      <div className="announcement">{tr("Rooted in Gondal. Growing with you. ")}<span>{tr("Free delivery on orders \u20B9500 and above")}</span></div>
      <a className="skip-link" href="#content">{tr("Skip to content")}</a>
      <header className="nav">
        <Link to="/" className="brand"><Brand /></Link>
        <div className="header-tools"><form className="header-search" role="search" onSubmit={e => {
          e.preventDefault();
          navigate('/shop?search=' + encodeURIComponent(search.trim()));
        }}><Icon name="search" size={17} /><input aria-label={tr("Search the shop")} placeholder={tr("What does your farm need?")} value={search} onChange={e => setSearch(e.target.value)} /><button aria-label={tr("Submit search")}><Icon name="arrow" size={17} /></button></form>
        <NotificationBell /><ProfileMenu /><button className="menu-button" aria-label={tr("Toggle navigation")} aria-controls="store-navigation" aria-expanded={menu} onClick={() => setMenu(!menu)}><span className="menu-lines" aria-hidden="true"><i /><i /><i /></span></button></div>
        <nav id="store-navigation" className={menu ? "open" : ""}>
          <LanguageSelector /><NavLink to="/home" end>{tr("Home")}</NavLink>
          <NavLink to="/shop">{tr("Shop")}</NavLink>
          <NavLink to="/about">{tr("About us")}</NavLink>
          <NavLink to="/blog">{tr("Blog")}</NavLink>
          <NavLink to="/contact">{tr("Contact")}</NavLink>
          {tr(user?.role === 'admin' && <NavLink to="/admin">{tr("Admin")}</NavLink>)}
        </nav>
      </header>
      </>)}
      <main id="content" className={adminArea ? 'admin-main' : authArea ? 'auth-main' : coverArea ? 'cover-main' : ''}>
        {tr(user && cartError && <div className="err" role="alert">{tr(cartError)} <button className="link" onClick={retryCart}>{tr("Retry cart")}</button></div>)}
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/shop" element={<Guard><Shop /></Guard>} />
          <Route path="/product/:id" element={<Guard><Product /></Guard>} />
          <Route path="/cart" element={<Guard><Cart /></Guard>} />
          <Route path="/checkout" element={<Guard><Checkout /></Guard>} />
          <Route path="/orders" element={<Guard><MyOrders /></Guard>} />
          <Route path="/notifications" element={<Guard><NotificationsPage /></Guard>} />
          <Route path="/login" element={user ? <Navigate to="/home" replace /> : <CustomerAuth />} />
          <Route path="/register" element={user ? <Navigate to="/home" replace /> : <CustomerAuth register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/account" element={<Guard><Account /></Guard>} />
          <Route path="/about" element={<Guard><About /></Guard>} />
          <Route path="/our-story" element={<Guard><Story /></Guard>} />
          <Route path="/our-team" element={<Guard><Team /></Guard>} />
          <Route path="/blog" element={<Guard><Blog /></Guard>} />
          <Route path="/post/gardening-solutions-seeds-pesticides-and-equipment-online" element={<Guard><BlogPost /></Guard>} />
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          <Route path="/home" element={<Guard><Home /></Guard>} />
          <Route path="/products" element={<Navigate to="/shop" replace />} />
          <Route path="/q-a-contact-us" element={<Navigate to="/contact" replace />} />
          <Route path="/contact" element={<Guard><Contact /></Guard>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<Guard admin><Admin /></Guard>} />
          <Route path="*" element={<p className="center">{tr("Page not found. ")}<Link to="/">{tr("Go home")}</Link></p>} />
        </Routes>
      </main>
      {showStore && count > 0 && !['/cart', '/checkout'].includes(loc.pathname) && <Link to="/cart" className="floating-cart" aria-label={`${tr('Your cart')} (${count})`}>
        <Icon name="bag" size={26} /><span className="floating-cart-count" key={count} aria-hidden="true">{count > 99 ? '99+' : tr(count)}</span>
      </Link>}
      {tr(showStore && <footer className="foot"><div className="footer-inner"><div><Link to="/" className="footer-brand"><Brand /></Link><p>{tr("Quality seeds and farm essentials.")}<br />{tr("For every season. For every farmer.")}</p></div><div><h4>{tr("Explore")}</h4><Link to="/about">{tr("About us")}</Link><Link to="/our-story">{tr("Our story")}</Link><Link to="/our-team">{tr("Our team")}</Link><Link to="/blog">{tr("Blog")}</Link><Link to="/welcome">{tr("Welcome to RAS")}</Link><Link to="/shop">{tr("All products")}</Link><Link to="/shop?category=Seeds">{tr("Seeds")}</Link><Link to="/shop?category=Fertilizers">{tr("Fertilizers")}</Link></div><div><h4>{tr("Here to help")}</h4><Link to="/contact">{tr("Contact us")}</Link><Link to="/orders">{tr("Your orders")}</Link><a href={SHOP.mapsUrl} target="_blank" rel="noreferrer">{tr("Visit our shop \u2197")}</a></div><div><h4>{tr("Find us")}</h4><ShopDetails /><span className="footer-note">{tr("A little care. A better harvest.")}</span></div></div><div className="footer-bottom">© {tr(new Date().getFullYear())} {tr(SHOP.name)}<span>{tr("Made for the people who grow.")}</span></div></footer>)}
    </>;
}

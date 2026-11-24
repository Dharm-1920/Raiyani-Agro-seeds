import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useCart } from './context';
import { productText, tr } from './language.jsx';
import Icon from './icons';
import { haptic, prefersReducedMotion } from './interactions.jsx';

export function QuantityControl({ value, max, onChange, disabled = false, name = '' }) {
  const limit = Math.max(1, Math.min(10000, Math.floor(Number(max) || 0)));
  const field = useRef(null);
  const update = next => onChange(Math.max(1, Math.min(limit, Math.trunc(Number(next) || 1))));
  // The number rolls up or down like a counter when + or − is pressed.
  const step = direction => {
    update(value + direction);
    if (field.current?.animate && !prefersReducedMotion()) field.current.animate([{ transform: `translateY(${direction * 60}%)`, opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
  return <div className="quantity-control" role="group" aria-label={`${tr('Quantity')} ${name}`.trim()}>
    <button type="button" aria-label={tr('Decrease quantity')} disabled={disabled || value <= 1} onClick={() => step(-1)}>−</button>
    <input ref={field} aria-label={`${tr('Quantity')} ${name}`.trim()} type="number" inputMode="numeric" min="1" max={limit} step="1" value={value} disabled={disabled} onChange={event => update(event.target.value)} />
    <button type="button" aria-label={tr('Increase quantity')} disabled={disabled || value >= limit} onClick={() => step(1)}>+</button>
  </div>;
}

const visible = element => { const rect = element?.getBoundingClientRect(); return rect?.width > 0 && rect?.height > 0; };
// Phones show the cart in the bottom dock; larger screens use the floating cart button.
const cartTarget = () => ['.fx-dock a[href="/cart"] .fx-dock-icon', '.floating-cart', '.cart-link', '.menu-button'].map(selector => document.querySelector(selector)).find(visible);
// The product's picture (photo or illustration) on its card or product page.
function productPicture(button) {
  const holder = button.closest('.card, .detail');
  const picture = holder?.querySelector('.product-image img, .product-image .ph') || holder?.querySelector(':scope > img, :scope > .ph');
  const rect = picture?.getBoundingClientRect();
  return rect && rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight ? picture : null;
}

function animateCartAdd(button, quantity) {
  if (!button?.animate || prefersReducedMotion()) return;
  button.getAnimations().forEach(animation => animation.cancel());
  button.animate([{ transform: 'scale(1)' }, { transform: 'scale(.95)', offset: .3 }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.22,.61,.36,1)' });
  requestAnimationFrame(() => {
    if (!button.isConnected) return;
    const target = cartTarget();
    if (!target) return;
    const picture = productPicture(button);
    const flyer = document.createElement('span');
    flyer.setAttribute('aria-hidden', 'true');
    let from;
    if (picture) {
      // A copy of the product picture lifts off the card and drops into the cart.
      const box = picture.getBoundingClientRect(), size = Math.min(box.width, box.height, 220);
      from = { left: box.left + (box.width - size) / 2, top: box.top + (box.height - size) / 2, width: size, height: size };
      flyer.className = 'cart-fly';
      Object.assign(flyer.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${size}px`, height: `${size}px` });
      const copy = picture.tagName === 'IMG' ? Object.assign(new Image(), { src: picture.currentSrc || picture.src, alt: '' }) : picture.cloneNode(true);
      flyer.appendChild(copy);
    } else {
      const box = button.getBoundingClientRect();
      from = { left: box.left + box.width / 2 - 26, top: box.top + box.height / 2 - 20, width: 52, height: 40 };
      flyer.className = 'cart-fly-dot';
      const icon = button.querySelector('svg')?.cloneNode(true);
      if (icon) flyer.appendChild(icon);
      Object.assign(flyer.style, { left: `${from.left}px`, top: `${from.top}px` });
    }
    document.body.appendChild(flyer);
    const to = target.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const end = Math.max(.1, Math.min(.5, 30 / from.width)), lift = Math.min(160, 60 + Math.abs(dx) * .25);
    // Sample one continuous arc so the picture never changes direction abruptly.
    const frames = Array.from({ length: 25 }, (_, index) => {
      const t = index / 24, scale = 1 - (1 - end) * t;
      return { offset: t, transform: `translate(${dx * t}px,${dy * t - 4 * lift * t * (1 - t)}px) scale(${t < .12 ? 1 + t * .6 : scale}) rotate(${-14 * t}deg)`, opacity: t < .82 ? 1 : (1 - t) / .18 };
    });
    const flight = flyer.animate(frames, { duration: picture ? 900 : 1100, easing: 'cubic-bezier(.45,0,.25,1)' });
    flight.finished.then(() => {
      flyer.remove();
      target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18) rotate(-6deg)', offset: .4 }, { transform: 'scale(.96)', offset: .7 }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out' });
      // "+2" floats up from the cart.
      const plus = document.createElement('span');
      plus.className = 'cart-fly-plus';
      plus.setAttribute('aria-hidden', 'true');
      plus.textContent = `+${quantity}`;
      Object.assign(plus.style, { left: `${to.left + to.width / 2}px`, top: `${to.top}px` });
      document.body.appendChild(plus);
      plus.animate([{ transform: 'translate(-50%,0) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-22px) scale(1)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-38px) scale(1)', opacity: 0 }], { duration: 900, easing: 'ease-out' }).finished.then(() => plus.remove(), () => plus.remove());
    }, () => flyer.remove());
  });
}

export function ProductPurchase({ product, compact = false }) {
  const { user } = useAuth();
  const { add, items, ready } = useCart();
  const navigate = useNavigate(), location = useLocation();
  const [qty, setQty] = useState(1), [added, setAdded] = useState(0);
  const signIn = () => navigate('/login', { state: { from: location.pathname + location.search } });
  const stock = Math.max(0, Math.min(10000, Math.floor(Number(product.stock) || 0)));
  const quantity = Math.min(qty, stock);
  const inCart = items.find(item => item.id === product._id)?.qty || 0;
  const remaining = Math.max(0, stock - inCart);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(0), 2400);
    return () => clearTimeout(timer);
  }, [added]);
  const buyNow = () => navigate('/checkout', { state: { buyNow: { accountId: user.id, item: {
    id: product._id, name: product.name, nameGu: product.nameGu, price: product.price,
    image: product.images?.[0], stock, qty: quantity,
  } } } });
  if (!user) return <div className={`product-purchase${compact ? ' compact' : ''}`}>
    <div className="purchase-buttons">
      <button type="button" className="purchase-add" disabled={!stock} onClick={signIn}><Icon name="bag" size={18} />{tr('Add to cart')}</button>
      <button type="button" className="purchase-buy" disabled={!stock} onClick={signIn}>{tr('Buy now')}<Icon name="arrow" size={17} /></button>
    </div>
    <span className="purchase-feedback">{tr('Sign in to order. Your cart is saved to your account.')}</span>
  </div>;
  return <div className={`product-purchase${compact ? ' compact' : ''}`}>
    <QuantityControl value={quantity || 1} max={stock} disabled={!ready || !stock} onChange={setQty} name={productText(product)} />
    <div className="purchase-buttons">
      <button type="button" className={`purchase-add${added ? ' is-added' : ''}`} disabled={!ready || !stock || quantity > remaining} onClick={event => {
        add(product, quantity);
        setAdded(value => value + 1);
        animateCartAdd(event.currentTarget, quantity);
        haptic(15);
        // Shows the "Added to cart · View cart" message (CartToast in interactions.jsx).
        window.dispatchEvent(new CustomEvent('ras:cart-added', { detail: { name: productText(product), image: product.images?.[0], quantity } }));
      }}><Icon name={added ? 'check' : 'bag'} size={18} />{tr(added ? 'Added to cart' : 'Add to cart')}</button>
      <button type="button" className="purchase-buy" disabled={!ready || !stock} onClick={buyNow}>{tr('Buy now')}<Icon name="arrow" size={17} /></button>
    </div>
    <span className="purchase-feedback" role="status"><span key={added}>{tr(added ? 'Added to cart' : ready && quantity > remaining ? remaining ? 'Only {count} more can be added to your cart.' : 'All available stock is in your cart.' : '').replace('{count}', String(remaining))}</span></span>
  </div>;
}

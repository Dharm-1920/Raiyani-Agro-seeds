import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useCart } from './context';
import { productText, tr } from './language.jsx';
import Icon from './icons';

export function QuantityControl({ value, max, onChange, disabled = false, name = '' }) {
  const limit = Math.max(1, Math.min(10000, Math.floor(Number(max) || 0)));
  const update = next => onChange(Math.max(1, Math.min(limit, Math.trunc(Number(next) || 1))));
  return <div className="quantity-control" role="group" aria-label={`${tr('Quantity')} ${name}`.trim()}>
    <button type="button" aria-label={tr('Decrease quantity')} disabled={disabled || value <= 1} onClick={() => update(value - 1)}>−</button>
    <input aria-label={`${tr('Quantity')} ${name}`.trim()} type="number" inputMode="numeric" min="1" max={limit} step="1" value={value} disabled={disabled} onChange={event => update(event.target.value)} />
    <button type="button" aria-label={tr('Increase quantity')} disabled={disabled || value >= limit} onClick={() => update(value + 1)}>+</button>
  </div>;
}

function animateCartAdd(button, quantity) {
  if (!button?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  button.getAnimations().forEach(animation => animation.cancel());
  button.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)', offset: .3 }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.22,.61,.36,1)' });
  requestAnimationFrame(() => {
  if (!button.isConnected) return;
  const target = [document.querySelector('.floating-cart'), document.querySelector('.cart-link'), document.querySelector('.menu-button')].find(element => {
    const rect = element?.getBoundingClientRect();
    return rect?.width > 0 && rect?.height > 0;
  });
  if (!target) return;
  const from = button.getBoundingClientRect(), to = target.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'cart-fly-dot';
  dot.setAttribute('aria-hidden', 'true');
  const icon = button.querySelector('svg')?.cloneNode(true);
  if (icon) dot.appendChild(icon);
  const count = document.createElement('span');
  count.textContent = `+${quantity}`;
  dot.appendChild(count);
  dot.style.left = `${from.left + from.width / 2 - 26}px`;
  dot.style.top = `${from.top + from.height / 2 - 20}px`;
  document.body.appendChild(dot);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  // Sample one continuous curve so the parcel never changes direction abruptly.
  const frames = Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    const x = dx * t;
    const y = dy * t - 4 * 85 * t * (1 - t);
    return { offset: t, transform: `translate(${x}px,${y}px) scale(${1 - .65 * t})`, opacity: t < .8 ? 1 : (1 - t) / .2 };
  });
  const flight = dot.animate(frames, { duration: 1250, easing: 'cubic-bezier(.4,0,.2,1)' });
  flight.finished.then(() => {
    dot.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 500, easing: 'ease-in-out' });
  }, () => dot.remove());
  });
}

export function ProductPurchase({ product, compact = false }) {
  const { user } = useAuth();
  const { add, items, ready } = useCart();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1), [added, setAdded] = useState(0);
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
  return <div className={`product-purchase${compact ? ' compact' : ''}`}>
    <QuantityControl value={quantity || 1} max={stock} disabled={!ready || !stock} onChange={setQty} name={productText(product)} />
    <div className="purchase-buttons">
      <button type="button" className={`purchase-add${added ? ' is-added' : ''}`} disabled={!ready || !stock || quantity > remaining} onClick={event => {
        add(product, quantity);
        setAdded(value => value + 1);
        animateCartAdd(event.currentTarget, quantity);
      }}><Icon name={added ? 'check' : 'bag'} size={18} />{tr(added ? 'Added to cart' : 'Add to cart')}</button>
      <button type="button" className="purchase-buy" disabled={!ready || !stock} onClick={buyNow}>{tr('Buy now')}<Icon name="arrow" size={17} /></button>
    </div>
    <span className="purchase-feedback" role="status"><span key={added}>{tr(added ? 'Added to cart' : ready && quantity > remaining ? remaining ? 'Only {count} more can be added to your cart.' : 'All available stock is in your cart.' : '').replace('{count}', String(remaining))}</span></span>
  </div>;
}

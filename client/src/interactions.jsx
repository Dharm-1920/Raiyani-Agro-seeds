// Storefront interactions: scroll reveal, scroll progress, smart header, back-to-top,
// "Added to cart" toast, press ripples, cover parallax, number tweening and haptics.
// Everything here respects "reduce motion" and never runs on admin pages. Styles: interactions.css.
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { tr, useLanguage } from './language.jsx';
import Icon from './icons';

export const prefersReducedMotion = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** A tiny vibration on phones (Android) to confirm an action; silently ignored elsewhere. */
export function haptic(ms = 12) {
  try { if (navigator.vibrate && window.matchMedia('(pointer: coarse)').matches) navigator.vibrate(ms); } catch { /* Not supported. */ }
}

/** Smoothly counts a number towards its new value (for totals). */
export function useTween(value, duration = 450) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion() || current.current === value) { current.current = value; setShown(value); return; }
    const from = current.current, start = performance.now();
    let frame;
    const step = now => {
      const progress = Math.min(1, (now - start) / duration), eased = 1 - Math.pow(1 - progress, 3);
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

// Content that glides in as it scrolls into view. Things already on screen when a page opens stay put.
const REVEAL = ['.benefits > div', '.section-head', '.categories > .category', '.grid > .card', '.wix-intro-top > *', '.wix-about-row', '.wix-farm-strip', '.wix-section-intro', '.business-values > article', '.about-banner', '.visit', '.ras-story-card', '.cover-app-banner', '.cover-discover-heading', '.wix-product-gallery > a', '.wix-team-gallery > article', '.wix-blog-card', '.wix-story-layout > *', '.business-faq details', '.contact-info', '.contact-layout > .box', '.fx-order', '.notification-item', '.related-products .section-head'].join(',');
export function ScrollReveal() {
  const { pathname } = useLocation();
  useEffect(() => {
    const root = document.getElementById('content');
    if (!root || pathname.startsWith('/admin') || prefersReducedMotion() || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('reveal-on');
    const timers = new Set();
    const finish = element => {
      element.classList.add('is-revealed');
      // Hand the element back to its normal styles (hover lifts etc.) once the glide has finished.
      const timer = setTimeout(() => { element.classList.remove('reveal', 'is-revealed'); element.style.removeProperty('--reveal-delay'); timers.delete(timer); }, 900 + (parseInt(element.style.getPropertyValue('--reveal-delay'), 10) || 0));
      timers.add(timer);
    };
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      finish(entry.target);
    }), { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    const prepare = initial => root.querySelectorAll(REVEAL).forEach(element => {
      if (element.dataset.reveal) return;
      element.dataset.reveal = '1';
      if (initial && element.getBoundingClientRect().top < window.innerHeight * 0.92) return;
      const siblings = [...(element.parentElement?.children || [])].filter(child => child.matches(REVEAL));
      element.style.setProperty('--reveal-delay', `${Math.max(0, siblings.indexOf(element)) % 4 * 80}ms`);
      element.classList.add('reveal');
      observer.observe(element);
    });
    prepare(true);
    let queued = 0;
    const mutations = new MutationObserver(() => { if (!queued) queued = requestAnimationFrame(() => { queued = 0; prepare(false); }); });
    mutations.observe(root, { childList: true, subtree: true });
    return () => {
      mutations.disconnect(); observer.disconnect(); cancelAnimationFrame(queued);
      timers.forEach(clearTimeout);
      root.querySelectorAll('.reveal').forEach(element => element.classList.remove('reveal', 'is-revealed'));
    };
  }, [pathname]);
  return null;
}

/** A thin line at the top of the screen showing how far down the page you are. */
export function ScrollProgress() {
  const bar = useRef(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar.current) bar.current.style.transform = `scaleX(${max > 40 ? Math.min(1, window.scrollY / max) : 0})`;
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    const resize = 'ResizeObserver' in window ? new ResizeObserver(queue) : null;
    resize?.observe(document.body);
    return () => { window.removeEventListener('scroll', queue); window.removeEventListener('resize', queue); resize?.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  return <div className="scroll-progress" aria-hidden="true"><span ref={bar} /></div>;
}

/** The header tucks away while scrolling down and slides back when scrolling up. */
export function useSmartHeader(active, locked) {
  const lock = useRef(locked);
  lock.current = locked;
  const { pathname } = useLocation();
  useEffect(() => {
    const header = document.querySelector('header.nav');
    if (!active || !header) return;
    let last = window.scrollY, frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY, delta = y - last;
      header.classList.toggle('is-scrolled', y > 8);
      let keyboardFocus = false;
      try { keyboardFocus = Boolean(header.querySelector(':focus-visible')); } catch { /* Older browsers. */ }
      const busy = lock.current || header.querySelector('.profile-popover') || keyboardFocus;
      if (busy || y < header.offsetHeight + 60) header.classList.remove('is-hidden');
      else if (delta > 8 && !prefersReducedMotion()) header.classList.add('is-hidden');
      else if (delta < -8) header.classList.remove('is-hidden');
      if (Math.abs(delta) > 8) last = y;
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    const show = () => header.classList.remove('is-hidden');
    update();
    window.addEventListener('scroll', queue, { passive: true });
    header.addEventListener('focusin', show);
    return () => { window.removeEventListener('scroll', queue); header.removeEventListener('focusin', show); cancelAnimationFrame(frame); header.classList.remove('is-hidden', 'is-scrolled'); };
  }, [active, pathname]);
}

/** Round button that appears after scrolling down a long page. */
export function BackToTop() {
  const [shown, setShown] = useState(false);
  useLanguage();
  useEffect(() => {
    const check = () => setShown(window.scrollY > window.innerHeight * 1.4);
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, []);
  return <button type="button" className={'back-to-top' + (shown ? ' is-shown' : '')} aria-label={tr('Back to top')} title={tr('Back to top')} tabIndex={shown ? 0 : -1} aria-hidden={!shown} onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}>
    <Icon name="arrow" size={19} style={{ transform: 'rotate(-90deg)' }} />
  </button>;
}

/** Confirms an add-to-cart with the product and a clear next step. Listens for the "ras:cart-added" event. */
export function CartToast() {
  const [item, setItem] = useState(null), [open, setOpen] = useState(false);
  const paused = useRef(false);
  const { pathname } = useLocation();
  useLanguage();
  useEffect(() => {
    const added = event => { setItem({ ...event.detail, key: Date.now() }); setOpen(true); };
    window.addEventListener('ras:cart-added', added);
    return () => window.removeEventListener('ras:cart-added', added);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    let timer;
    const wait = () => { timer = setTimeout(() => { if (paused.current) wait(); else setOpen(false); }, 4800); };
    wait();
    return () => clearTimeout(timer);
  }, [open, item?.key]);
  const hold = value => () => { paused.current = value; };
  return <div className={'cart-toast' + (open ? ' is-open' : '')} role="status" aria-live="polite" aria-hidden={!open} onMouseEnter={hold(true)} onMouseLeave={hold(false)} onFocus={hold(true)} onBlur={hold(false)}>
    {item && <>
      <span className="cart-toast-thumb" key={item.key}>{item.image ? <img src={item.image} alt="" /> : <Icon name="check" size={22} />}</span>
      <span className="cart-toast-text"><b>{tr('Added to cart')}</b><small>{item.name} × {item.quantity}</small></span>
      <Link className="cart-toast-link" to="/cart" tabIndex={open ? 0 : -1}>{tr('View cart')}<Icon name="arrow" size={16} /></Link>
      <button type="button" className="cart-toast-close" aria-label={tr('Close')} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}><Icon name="close" size={16} /></button>
    </>}
  </div>;
}

// Material-style ripple from the exact point a button or option is pressed.
const RIPPLE = '.btn, .fx-place, .purchase-buttons button, .shop-chips button, .fx-pay-option, .address-add-button, .address-label-choices button, .auth-submit, .notify-button, .fx-dock-item, .cart-toast-link, button[type="submit"]';
export function useRipple() {
  useEffect(() => {
    const press = event => {
      if (event.button !== 0 || prefersReducedMotion()) return;
      const host = event.target.closest?.(RIPPLE);
      if (!host || host.closest('.admin-main') || host.disabled || host.getAttribute('aria-disabled') === 'true') return;
      const box = host.getBoundingClientRect(), size = Math.max(box.width, box.height) * 2.2;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.setAttribute('aria-hidden', 'true');
      Object.assign(ripple.style, { width: `${size}px`, height: `${size}px`, left: `${event.clientX - box.left - size / 2}px`, top: `${event.clientY - box.top - size / 2}px` });
      host.classList.add('ripple-host');
      host.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    };
    document.addEventListener('pointerdown', press, { passive: true });
    return () => document.removeEventListener('pointerdown', press);
  }, []);
}

/** The cover photo drifts slower than the page for a sense of depth. */
export function useCoverParallax(active) {
  useEffect(() => {
    const photo = document.querySelector('.cover-landscape');
    if (!active || !photo || prefersReducedMotion()) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      if (y < window.innerHeight * 1.2) photo.style.transform = `translate3d(0, ${y * 0.28}px, 0) scale(1.08)`;
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', queue, { passive: true });
    return () => { window.removeEventListener('scroll', queue); cancelAnimationFrame(frame); photo.style.transform = ''; };
  }, [active]);
}

import { useEffect, useState } from 'react';
import api, { errMsg } from './api';
import { productText, tr } from './language.jsx';
import './counter-product-picker.css';

const money = value => '₹' + Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = value => Number(Number(value).toFixed(3));
const empty = () => ({ name: '', nameGu: '', unit: '', qty: '1', price: '' });
const isBlank = item => !item.productId && !item.name && !item.price;

export default function CounterProductPicker({ items, onChange, inventoryVersion }) {
  const [query, setQuery] = useState(''), [category, setCategory] = useState(''), [page, setPage] = useState(1);
  const [catalogue, setCatalogue] = useState({ items: [], categories: [], total: 0, pages: 0 });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    const timer = setTimeout(() => {
      api.get('/products', { params: { search: query.trim(), category, page, limit: 24 } })
        .then(({ data }) => { if (active) setCatalogue(data); })
        .catch(failure => { if (active) setError(errMsg(failure)); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [query, category, page, tick, inventoryVersion]);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setTick(value => value + 1); };
    window.addEventListener('focus', refresh);
    const timer = setInterval(refresh, 30000);
    return () => { window.removeEventListener('focus', refresh); clearInterval(timer); };
  }, []);
  const selectedQuantity = id => quantity(items.filter(item => item.productId === id).reduce((sum, item) => sum + Number(item.qty || 0), 0));
  const update = (index, key, value) => onChange(current => current.map((item, i) => i === index ? { ...item, [key]: value } : item));
  const add = product => {
    onChange(current => {
      const selected = current.filter(item => item.productId === product._id).reduce((sum, item) => sum + Number(item.qty || 0), 0);
      const increment = Math.min(1, quantity(product.stock - selected));
      if (increment <= 0) return current;
      const index = current.findIndex(item => item.productId === product._id);
      if (index >= 0) return current.map((item, i) => i === index ? { ...item, qty: String(quantity(Number(item.qty || 0) + increment)) } : item);
      const lines = current.filter(item => !isBlank(item));
      if (lines.length >= 100) return current;
      return [...lines, { productId: product._id, name: product.name, nameGu: product.nameGu || '', unit: product.unit || '', qty: String(increment), price: String(product.price) }];
    });
  };
  const addManual = () => {
    onChange(current => current.length < 100 ? [...current.filter(item => !isBlank(item)), empty()] : current);
  };
  const remove = index => onChange(current => current.filter((_, i) => i !== index));
  const count = items.filter(item => !isBlank(item)).length;
  return <section className="admin-panel counter-pos">
    <div className="counter-pos-heading"><div><span className="eyebrow">{tr('TAP. ADD. BILL.')}</span><h3>{tr('Products & bill items')}</h3><p>{tr('Your online catalogue, ready at the counter. Tap a product to add it.')}</p></div><span className="counter-stock-label">{tr('Shared online stock')}</span></div>
    <div className="counter-pos-layout">
      <div className="counter-catalogue">
        <div className="counter-catalogue-search"><label>{tr('Find a product')}<input type="search" placeholder={tr('Search product name…')} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label><button type="button" className="secondary" onClick={() => setTick(value => value + 1)}>{tr('Refresh products')}</button></div>
        <div className="counter-categories" role="group" aria-label={tr('Product categories')}><button type="button" aria-pressed={!category} onClick={() => { setCategory(''); setPage(1); }}>{tr('All products')}</button>{catalogue.categories.map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => { setCategory(value); setPage(1); }}>{tr(value)}</button>)}</div>
        <div className="counter-catalogue-caption"><span>{tr('Products')}: {catalogue.total}</span><small>{tr('Stock updates on refresh and when you save.')}</small></div>
        {error && <p className="err" role="alert">{tr(error)}</p>}
        {loading ? <p className="counter-catalogue-state" role="status">{tr('Loading products…')}</p> : error ? <p className="counter-catalogue-state">{tr('Refresh products to try again. Manual items are still available.')}</p> : <>
          <div className="counter-product-grid">{catalogue.items.map(product => {
            const chosen = selectedQuantity(product._id), remaining = quantity(product.stock - chosen);
            return <button type="button" className={'counter-product-card' + (chosen ? ' is-added' : '')} key={product._id} disabled={remaining <= 0 || count >= 100 && !chosen} onClick={() => add(product)} aria-label={tr('Add product') + ': ' + productText(product)}>
              <div className="counter-product-image">{product.images?.[0] ? <img src={product.images[0]} alt="" loading="lazy" /> : <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 51V29M32 37C14 38 12 24 13 17c14 0 23 7 19 20Zm0-8C31 13 43 9 53 10c0 14-8 21-21 19Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}{chosen > 0 && <span className="counter-added-badge">{chosen} {tr('in bill')}</span>}</div>
              <span className="counter-product-name">{productText(product)}</span><span className="counter-product-unit">{productText(product, 'unit')}</span><span className="counter-product-price">{money(product.price)}<span className="counter-add-icon" aria-hidden="true">+</span></span><small className={remaining < 1 ? 'counter-stock-empty' : ''}>{remaining <= 0 ? tr(product.stock <= 0 ? 'Out of stock' : 'All stock added') : tr('Available') + ': ' + remaining}</small>
            </button>;
          })}</div>
          {!catalogue.items.length && <p className="counter-catalogue-state">{tr('No products found. Add products in Products or use a manual item.')}</p>}
          {catalogue.pages > 1 && <nav className="counter-catalogue-pages" aria-label={tr('Product pages')}><button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>{tr('Previous')}</button><span>{page} / {catalogue.pages}</span><button type="button" className="secondary" disabled={page >= catalogue.pages} onClick={() => setPage(value => value + 1)}>{tr('Next')}</button></nav>}
        </>}
      </div>
      <div className="counter-basket" id="counter-current-bill">
        <div className="counter-basket-heading"><div><h4>{tr('Current bill')}</h4><small>{count} {tr('items selected')}</small></div><button type="button" className="secondary" disabled={items.length >= 100} onClick={addManual}>{tr('+ Manual item')}</button></div>
        <p className="counter-stock-help">{tr('Catalogue items reduce online stock when the bill is saved. Manual items do not change stock.')}</p>
        {!items.length && <p className="counter-catalogue-state">{tr('Your bill is empty. Tap a product or add a manual item.')}</p>}
        <div className="counter-basket-lines">{items.map((item, index) => <article className="counter-basket-line" key={index}>
          <div className="counter-basket-item-top"><span className={'counter-item-kind' + (item.productId ? ' is-linked' : '')}>{tr(item.productId ? 'Online stock linked' : 'Manual item')}</span><button type="button" className="link danger" aria-label={tr('Remove') + ': ' + (item.name || tr('Manual item'))} onClick={() => remove(index)}>{tr('Remove')}</button></div>
          <label className="counter-basket-name">{tr('Item name')}<input required maxLength="220" value={item.productId ? productText(item) : item.name} readOnly={Boolean(item.productId)} onChange={event => update(index, 'name', event.target.value)} /></label>
          {!item.productId && <label className="counter-manual-gu">{tr('Gujarati item name (optional)')}<input lang="gu" maxLength="220" value={item.nameGu} onChange={event => update(index, 'nameGu', event.target.value)} /></label>}
          <div className="counter-basket-fields"><label>{tr('Unit')}<input maxLength="30" placeholder={tr('pack / kg')} value={item.unit} readOnly={Boolean(item.productId)} onChange={event => update(index, 'unit', event.target.value)} /></label><label>{tr('Selling price (₹)')}<input required type="number" inputMode="decimal" min="0" max="10000000" step="0.01" value={item.price} onChange={event => update(index, 'price', event.target.value)} /></label></div>
          <div className="counter-basket-bottom"><label>{tr('Quantity')}<span className="counter-quantity"><button type="button" aria-label={tr('Decrease quantity') + ': ' + item.name} disabled={Number(item.qty) <= 1} onClick={() => update(index, 'qty', String(quantity(Number(item.qty) - 1)))}>−</button><input required aria-label={tr('Quantity') + ': ' + item.name} type="number" inputMode="decimal" min="0.001" max="10000" step="0.001" value={item.qty} onChange={event => update(index, 'qty', event.target.value)} /><button type="button" aria-label={tr('Increase quantity') + ': ' + item.name} disabled={Number(item.qty) >= 10000} onClick={() => update(index, 'qty', String(quantity(Number(item.qty || 0) + 1)))}>+</button></span></label><div><small>{tr('Amount')}</small><strong>{money(Math.round(Math.round(Number(item.price || 0) * 100) * Number(item.qty || 0)) / 100)}</strong></div></div>
        </article>)}</div>
        <p className="counter-basket-tip">{tr('Change selling prices for this bill without changing your online prices.')}</p>
        <a className="counter-checkout-link" href="#counter-checkout">{tr('Continue to customer & payment')} <span aria-hidden="true">↓</span></a>
      </div>
    </div>
  </section>;
}

import { tr } from './language.jsx';
import Icon from './icons.jsx';
import './product-fields.css';

const units = ['pack', 'kg', 'g', 'litre', 'ml', 'piece'];
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

export default function ProductFields({ form, setForm, categoryField }) {
  const change = (key, value) => setForm(current => ({ ...current, [key]: value, ...(['name', 'unit'].includes(key) ? { [key + 'Gu']: '' } : {}) }));
  const price = Number(form.price), mrp = Number(form.mrp);
  const hasPrice = form.price !== '' && Number.isFinite(price) && price >= 0;
  const savings = hasPrice && mrp > price ? Math.round((mrp - price) / mrp * 100) : 0;
  const field = (key, title, placeholder, help, optional = false) => <div className="product-detail-field">
    <label htmlFor={`product-${key}`}>{tr(title)}{optional && <span className="product-field-optional">{tr('Optional')}</span>}</label>
    <div className={key === 'stock' ? 'product-number-input' : 'product-money-input'}>
      <span aria-hidden="true">{key === 'stock' ? <Icon name="bag" size={19} /> : '₹'}</span>
      <input id={`product-${key}`} type="number" inputMode={key === 'stock' ? 'numeric' : 'decimal'} min="0" step={key === 'stock' ? 1 : '0.01'} required={!optional} placeholder={placeholder} value={form[key]} onChange={event => change(key, event.target.value)} aria-describedby={`product-${key}-help`} />
    </div>
    <small id={`product-${key}-help`}>{tr(help)}</small>
  </div>;
  return <div className="product-fields">
    <div className="product-auto-translation"><span><Icon name="check" size={20} /></span><div><strong>{tr('Automatic Gujarati translation')}</strong><p>{tr('Enter product details in English. We translate the name, description, category and pack size when you save. Customers see Gujarati automatically when they choose Gujarati.')}</p></div></div>
    <section className="product-form-section" aria-labelledby="product-information-title">
      <div className="product-form-section-head"><span><Icon name="leaf" size={21} /></span><div><h4 id="product-information-title">{tr('Product information')}</h4><p>{tr('Name, category and pack size for your shop.')}</p></div></div>
      <div className="product-fields-grid">
        <div className="product-detail-field"><label htmlFor="product-name">{tr('Product name')}</label><input id="product-name" required value={form.name} placeholder={tr('e.g. Cotton seeds')} onChange={event => change('name', event.target.value)} /></div>
        {categoryField}
        <div className="product-detail-field product-unit-field"><label htmlFor="product-unit">{tr('Unit / pack size')}</label><input id="product-unit" required value={form.unit} placeholder={tr('e.g. 500 g pack')} onChange={event => change('unit', event.target.value)} aria-describedby="product-unit-help" /><div className="product-unit-presets" role="group" aria-label={tr('Quick unit choices')}>{units.map(unit => <button key={unit} type="button" aria-pressed={form.unit === unit} onClick={() => change('unit', unit)}>{tr(unit)}</button>)}</div><small id="product-unit-help">{tr('Choose a unit or type your own pack size.')}</small></div>
      </div>
    </section>
    <section className="product-form-section" aria-labelledby="product-pricing-title">
      <div className="product-form-section-head"><span><Icon name="bag" size={21} /></span><div><h4 id="product-pricing-title">{tr('Pricing & stock')}</h4><p>{tr('Set your price and available quantity.')}</p></div></div>
      <div className="product-fields-grid">
        {field('price', 'Selling price (₹)', '0.00', 'Price the customer pays per unit.')}
        {field('mrp', 'MRP (₹)', '0.00', 'Printed maximum retail price.', true)}
        {field('stock', 'Stock quantity', '0', 'Number of units available to sell.')}
      </div>
      <output className="product-price-preview" aria-live="polite"><span><Icon name="eye" size={20} />{tr('Price preview')}</span><div>{hasPrice ? <><strong>{money(price)}</strong><span> / {form.unit || tr('unit')}</span>{mrp > price && <del>{money(mrp)}</del>}{savings > 0 && <b>{savings}% {tr('off')}</b>}</> : <span>{tr('Enter a selling price to see the preview.')}</span>}</div></output>
    </section>
  </div>;
}

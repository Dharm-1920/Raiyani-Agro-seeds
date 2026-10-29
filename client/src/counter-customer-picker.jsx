import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from './api';
import { tr } from './language.jsx';
import './counter-customer-picker.css';

export default function CounterCustomerPicker({ name = '', customerId, onNameChange, onSelect, onClear, disabled }) {
  const listId = useId();
  const [items, setItems] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false), [activeIndex, setActiveIndex] = useState(-1);
  const search = name.trim();
  useEffect(() => {
    setItems([]); setError(''); setActiveIndex(-1);
    if (disabled || customerId || search.length < 2 || !focused) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      api.get('/admin/counter-customers', { params: { search, limit: 8 } }).then(({ data }) => { if (active) setItems(data.items); })
        .catch(failure => { if (active) setError(errMsg(failure)); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search, name, customerId, focused, disabled]);
  const searching = focused && !disabled && !customerId && search.length >= 2;
  const expanded = searching && items.length > 0 && !loading;
  const select = customer => { setFocused(false); setItems([]); setActiveIndex(-1); onSelect(customer); };
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); setFocused(false); setActiveIndex(-1); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setFocused(true);
      if (items.length) setActiveIndex(index => event.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length : index) - 1);
    }
    if (event.key === 'Enter' && expanded) { event.preventDefault(); if (activeIndex >= 0) select(items[activeIndex]); }
  };
  return <div className="counter-name-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
    <label>{tr('Customer name')}<input required maxLength="120" autoComplete="off" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} value={name} readOnly={Boolean(customerId)} disabled={disabled} placeholder={tr('Start typing a customer name')} onFocus={() => setFocused(true)} onChange={event => { setItems([]); setActiveIndex(-1); setFocused(true); onNameChange(event.target.value); }} onKeyDown={keyDown} /></label>
    {searching && <div className="counter-name-suggestions">
      {loading && <p role="status">{tr('Searching customers…')}</p>}{error && <p className="err" role="alert">{tr(error)}</p>}
      {expanded && <div id={listId} role="listbox" aria-label={tr('Saved customer suggestions')}>{items.map((customer, index) => <button key={customer._id} id={`${listId}-${index}`} type="button" role="option" aria-selected={index === activeIndex} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => select(customer)}><strong>{customer.name}</strong><small>{customer.phone || tr('No phone saved')}{customer.address && ` · ${customer.address}`}</small></button>)}</div>}
      {!loading && !items.length && !error && <p>{tr('New customer — complete their details below.')}</p>}
    </div>}
    {customerId && <div className="counter-customer-selection"><span>{tr('Saved customer selected.')}</span><button type="button" className="link" disabled={disabled} onClick={onClear}>{tr('Use a different customer')}</button><Link className="books-open" to={`/admin?tab=Counter%20customers&customer=${customerId}`}>{tr('Customer statement / edit details')}</Link></div>}
  </div>;
}

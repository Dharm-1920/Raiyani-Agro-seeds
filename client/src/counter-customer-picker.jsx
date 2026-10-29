import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from './api';
import { tr } from './language.jsx';
export default function CounterCustomerPicker({ customerId, onSelect, onClear, disabled }) {
  const [search, setSearch] = useState(''), [items, setItems] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(false);
  useEffect(() => {
    if (search.trim().length < 2) { setItems([]); setError(''); setLoading(false); return; }
    let active = true;
    setItems([]); setLoading(true); setError('');
    const timer = setTimeout(() => {
      setLoading(true); setError('');
      api.get('/admin/counter-customers', { params: { search: search.trim(), limit: 8 } }).then(({ data }) => { if (active) setItems(data.items); })
        .catch(failure => { if (active) setError(errMsg(failure)); }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);
  return <div className="counter-customer-picker">
    <div className="counter-customer-tools"><label>{tr('Returning customer? Search name or phone')}<input type="search" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} placeholder={tr('Type at least 2 letters or phone digits')} /></label><Link className="books-open" to="/admin?tab=Counter%20customers">{tr('Customer directory')}</Link></div>
    {loading && <p role="status">{tr('Searching customers…')}</p>}{error && <p className="err" role="alert">{tr(error)}</p>}
    {items.length > 0 && <div className="counter-customer-results">{items.map(customer => <button key={customer._id} type="button" disabled={disabled} className="secondary" onClick={() => { onSelect(customer); setSearch(''); setItems([]); }}><span><strong>{customer.name}</strong><small>{customer.phone || tr('No phone saved')} · {customer.address}</small></span><span>{tr('Use customer')}</span></button>)}</div>}
    {!loading && search.trim().length >= 2 && !items.length && !error && <p>{tr('No saved customer found. Enter their details below to save a new customer.')}</p>}
    {customerId && <div className="counter-linked-customer"><span>{tr('Saved customer selected. Their details are filled below.')}</span><button type="button" className="link" disabled={disabled} onClick={onClear}>{tr('Use a different customer')}</button><Link className="books-open" to={`/admin?tab=Counter%20customers&customer=${customerId}`}>{tr('Customer statement / edit details')}</Link></div>}
  </div>;
}

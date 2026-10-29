import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import api, { errMsg } from './api';
import { useAuth } from './context';
import { tr, useLanguage } from './language.jsx';
import Icon from './icons.jsx';
import './address-book.css';

export function addressText(address) {
  return [address.line1, address.line2, address.landmark, [address.city, address.state, address.postalCode].filter(Boolean).join(', ')].filter(Boolean).join('\n');
}
const blank = { label: 'Home', name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', postalCode: '' };
const labelText = label => tr(({ Home: 'Home address', Work: 'Work address', Other: 'Other address' })[label] || label);
function AddressEditor({ address, user, isDefault, first, onSave, onCancel }) {
  const dialog = useRef(null), heading = useId();
  const [form, setForm] = useState({ ...blank, name: user.name, phone: user.phone || '', ...address });
  const [makeDefault, setMakeDefault] = useState(first || isDefault), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  const field = (key, title, autoComplete, required = true, limit = 200) => <label>{tr(title)}{!required && <small>{tr('Optional')}</small>}<input required={required} maxLength={limit} type={key === 'phone' ? 'tel' : 'text'} inputMode={key === 'postalCode' ? 'numeric' : undefined} pattern={key === 'postalCode' ? '[1-9][0-9]{5}' : undefined} autoComplete={autoComplete} value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} /></label>;
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave(form, makeDefault); }
    catch (error) { setError(errMsg(error)); setBusy(false); }
  };
  return createPortal(<dialog ref={dialog} className="address-editor-dialog" aria-labelledby={heading} onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); if (!busy) onCancel(); } }}>
    <div className="address-editor-heading"><div><span className="eyebrow">{tr('YOUR DELIVERIES')}</span><h2 id={heading}>{tr(address ? 'Edit address' : 'Add a new address')}</h2></div><button type="button" className="address-dialog-close" aria-label={tr('Close address form')} disabled={busy} onClick={onCancel}>×</button></div>
    <form onSubmit={submit}><fieldset disabled={busy}>
      <div className="address-label-choices" role="group" aria-label={tr('Address label')}>{['Home', 'Work', 'Other'].map(label => <button type="button" key={label} aria-pressed={form.label === label} onClick={() => setForm({ ...form, label })}>{labelText(label)}</button>)}</div>
      <div className="address-editor-grid">{field('name', 'Full name', 'shipping name', true, 120)}{field('phone', 'Phone', 'shipping tel', true, 40)}{field('postalCode', 'PIN code', 'shipping postal-code', true, 6)}{field('city', 'Town / City', 'shipping address-level2', true, 100)}</div>
      {field('line1', 'Flat, house number, building, street', 'shipping address-line1', true, 1000)}
      {field('line2', 'Area, colony or village', 'shipping address-line2', false)}
      <div className="address-editor-grid">{field('state', 'State', 'shipping address-level1', true, 100)}{field('landmark', 'Landmark', 'off', false, 150)}</div>
      <p className="address-country">{tr('Country')}: <strong>{tr('India')}</strong></p>
      <label className="address-default-choice"><input type="checkbox" checked={makeDefault} disabled={isDefault || first} onChange={event => setMakeDefault(event.target.checked)} />{tr('Use as my default delivery address')}</label>
      {error && <p className="err" role="alert">{tr(error)}</p>}
      <div className="address-editor-actions"><button type="submit">{tr(busy ? 'Saving…' : 'Save address')}<Icon name="check" size={17} /></button><button type="button" className="secondary" onClick={onCancel}>{tr('Cancel')}</button></div>
    </fieldset></form>
  </dialog>, document.body);
}

export default function AddressBook({ checkout = false, onSelect }) {
  const { user, refreshUser } = useAuth();
  useLanguage();
  const accountId = user.id, owner = useRef(accountId), callback = useRef(onSelect);
  owner.current = accountId; callback.current = onSelect;
  const [book, setBook] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [editor, setEditor] = useState(null), [selected, setSelected] = useState(null), [retry, setRetry] = useState(0);
  const current = book?.accountId === accountId ? book : null;
  useEffect(() => {
    const controller = new AbortController();
    setBook(null); setLoading(true); setError(''); setEditor(null); setSelected(null); setNotice('');
    api.get('/account/addresses', { signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted && owner.current === accountId && data.accountId === accountId) setBook(data); }).catch(() => { if (!controller.signal.aborted && owner.current === accountId) setError('Could not load addresses. Please retry.'); }).finally(() => { if (!controller.signal.aborted && owner.current === accountId) setLoading(false); });
    return () => controller.abort();
  }, [accountId, retry]);
  const chosen = current?.addresses.find(a => a._id === selected) || current?.addresses.find(a => a._id === current.defaultId) || null;
  useEffect(() => {
    if (checkout) callback.current?.(chosen ? { ...chosen, address: addressText(chosen), version: current.version } : null);
  }, [chosen, current?.version, checkout]);
  const mutate = async (method, path, data = {}) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.request({ method, url: '/account/addresses' + path, data: { ...data, accountId, version: current.version } });
      if (owner.current !== accountId) throw Error('Your account changed. Reload your addresses.');
      setBook(response.data);
      // Refresh the legacy default-address snapshot used by older screens.
      refreshUser().catch(() => {});
      return response.data;
    } catch (error) { if (owner.current === accountId) setError(errMsg(error)); throw error; }
    finally { if (owner.current === accountId) setBusy(false); }
  };
  const save = async (address, makeDefault) => {
    const result = await mutate(editor.address ? 'put' : 'post', editor.address ? '/' + editor.address._id : '', { address, makeDefault });
    if (checkout) setSelected(editor.address?._id || result.addresses[result.addresses.length - 1]._id);
    setEditor(null); setNotice('Address saved.');
  };
  const remove = async address => {
    if (!window.confirm(tr('Remove this saved address? Existing orders keep their delivery details.'))) return;
    try { await mutate('delete', '/' + address._id); setNotice('Address removed.'); } catch { /* Error shown below. */ }
  };
  const setDefault = async address => { try { await mutate('put', '/' + address._id + '/default'); setNotice('Default address updated.'); } catch { /* Error shown below. */ } };
  return <section className={'address-book' + (checkout ? ' address-book-checkout' : ' account-panel')} id={checkout ? undefined : 'delivery-address'}>
    <div className="account-panel-heading"><div><span className="eyebrow">{tr(checkout ? 'DELIVER TO' : 'YOUR DELIVERIES')}</span><h2>{tr(checkout ? 'Choose a delivery address' : 'Your addresses')}</h2><p>{tr('Save Home, Work and other addresses for faster checkout.')}</p></div><button type="button" className="address-add-button" disabled={loading || busy || !current || current.addresses.length >= 20} onClick={() => { setError(''); setEditor({ address: null }); }}><span aria-hidden="true">+</span>{tr('Add address')}</button></div>
    {loading && <p role="status">{tr('Loading addresses…')}</p>}
    {error && <div className="err" role="alert">{tr(error)} <button type="button" className="secondary" disabled={busy} onClick={() => setRetry(n => n + 1)}>{tr('Refresh addresses')}</button></div>}
    {notice && <p className="ok" role="status">{tr(notice)}</p>}
    {current && !current.addresses.length && <div className="address-book-empty"><Icon name="pin" size={30} /><h3>{tr('Add your first delivery address')}</h3><p>{tr('Save an address once and select it whenever you order.')}</p><button type="button" onClick={() => setEditor({ address: null })}>{tr('Add address')}</button></div>}
    <div className="address-card-grid">{current?.addresses.map(address => <article key={address._id} className={'address-book-card' + (checkout && chosen?._id === address._id ? ' is-selected' : '')}>
      <div className="address-card-top"><span className="address-type"><Icon name="pin" size={16} />{labelText(address.label || 'Other')}</span>{current.defaultId === address._id && <span className="address-default-badge"><Icon name="check" size={13} />{tr('Default')}</span>}</div>
      {checkout ? <label className="address-select-label"><input type="radio" name="delivery-address" value={address._id} checked={chosen?._id === address._id} disabled={busy} onChange={() => setSelected(address._id)} /><strong>{address.name}</strong></label> : <strong>{address.name}</strong>}
      <p className="address-card-lines">{addressText(address)}</p><span className="address-card-phone">{address.phone}</span>
      <div className="address-card-actions"><button type="button" className="secondary" disabled={busy} onClick={() => { setError(''); setEditor({ address }); }}>{tr('Edit')}</button><button type="button" className="secondary" disabled={busy} onClick={() => remove(address)}>{tr('Remove')}</button>{current.defaultId !== address._id && <button type="button" className="secondary" disabled={busy} onClick={() => setDefault(address)}>{tr('Set as default')}</button>}</div>
    </article>)}</div>
    {checkout && chosen && <p className="address-delivery-confirmation"><Icon name="check" size={17} />{tr('Your order will be delivered to the selected address.')}</p>}
    {editor && current && <AddressEditor key={accountId + (editor.address?._id || 'new')} user={user} address={editor.address} first={!current.addresses.length} isDefault={editor.address?._id === current.defaultId} onSave={save} onCancel={() => { if (!busy) setEditor(null); }} />}
  </section>;
}

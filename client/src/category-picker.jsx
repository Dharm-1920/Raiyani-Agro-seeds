import { useEffect, useId, useRef, useState } from 'react';
import { tr } from './language.jsx';
import Icon from './icons.jsx';
import './category-picker.css';

const icons = { Seeds: 'leaf', Fertilizers: 'sun', Pesticides: 'shield', Tools: 'tool' };

export default function CategoryPicker({ value, options, onChange, disabled = false }) {
  const id = useId(), root = useRef(null), trigger = useRef(null), search = useRef(null), custom = useRef(null);
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const filtered = options.filter(option => `${option} ${tr(option)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const isCustom = !options.includes(value);
  const close = (restore = false) => { setOpen(false); if (restore) trigger.current?.focus(); };
  const choose = category => { onChange(category); close(true); };
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => { if (open) root.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active, open, query]);
  const show = () => { setQuery(''); setActive(Math.max(0, options.indexOf(value))); setOpen(true); };
  const keys = event => {
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(current => Math.max(0, Math.min(filtered.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
    }
    if (event.key === 'Enter') { event.preventDefault(); if (filtered[active]) choose(filtered[active]); }
  };
  return <div className="product-category-field category-picker" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <label id={`${id}-label`} htmlFor={`${id}-trigger`}>{tr('Category')}</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="category-picker-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-describedby={`${id}-help`} onClick={() => open ? close() : show()} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); show(); } }}>
      <span className="category-picker-icon"><Icon name={icons[value] || 'bag'} size={20} /></span>
      <span>{value ? tr(value) : tr('New category name')}</span>
      <svg className="category-picker-chevron" data-open={open} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && <div className="category-picker-popup">
      <div className="category-picker-search"><Icon name="search" size={18} /><input ref={search} role="combobox" aria-label={tr('Search categories')} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined} value={query} placeholder={tr('Search categories')} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={keys} autoComplete="off" /></div>
      <div className="category-picker-options" id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}>
        {filtered.map((category, index) => <div key={category} id={`${id}-option-${index}`} role="option" aria-selected={category === value} data-active={active === index} onPointerMove={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => choose(category)}>
          <span className="category-picker-icon"><Icon name={icons[category] || 'bag'} size={19} /></span><span>{tr(category)}</span>{category === value && <Icon name="check" size={19} />}
        </div>)}
        {!filtered.length && <p role="status">{tr('No matching categories')}</p>}
      </div>
      <button type="button" className="category-picker-add" onClick={() => { onChange(''); close(); requestAnimationFrame(() => custom.current?.focus()); }}><span aria-hidden="true">+</span>{tr('Add new category')}</button>
    </div>}
    {isCustom && <label htmlFor={`${id}-new`}>{tr('New category name')}<input ref={custom} id={`${id}-new`} required disabled={disabled} maxLength={100} value={value} placeholder={tr('Enter category name')} onChange={event => onChange(event.target.value)} /></label>}
    <small id={`${id}-help`}>{tr('Choose an existing category or add a new one.')}</small>
  </div>;
}

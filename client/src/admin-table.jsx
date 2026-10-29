import { Children, cloneElement, isValidElement, useEffect, useRef, useState } from 'react';
import { tr } from './language.jsx';

export function BookReference({ value }) {
  const full = String(value || '—');
  const short = full.replace(/^([A-Z]+-)[a-f0-9]{16}([a-f0-9]{8})$/i, '$1$2').toUpperCase();
  return <span className="admin-reference" title={full} aria-label={full}>{short}</span>;
}

export default function AdminTable({ children, label, className = '', mobileCards = false, numericColumns = [], minWidth = 640 }) {
  const scroller = useRef(null), table = useRef(null);
  const [scrollable, setScrollable] = useState(false);
  useEffect(() => {
    const check = () => setScrollable(scroller.current.scrollWidth > scroller.current.clientWidth + 1);
    check();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    observer?.observe(scroller.current); observer?.observe(table.current);
    window.addEventListener('resize', check);
    return () => { observer?.disconnect(); window.removeEventListener('resize', check); };
  }, []);
  const sections = Children.toArray(children).filter(isValidElement);
  const head = sections.find(section => isValidElement(section) && section.type === 'thead');
  const headingRow = head && Children.toArray(head.props.children).find(isValidElement);
  const headings = headingRow ? Children.toArray(headingRow.props.children).map(cell => cell.props?.children) : [];
  const decorate = section => {
    if (!isValidElement(section) || !['thead', 'tbody'].includes(section.type)) return section;
    return cloneElement(section, {}, Children.map(section.props.children, row => {
      if (!isValidElement(row) || row.type !== 'tr') return row;
      return cloneElement(row, {}, Children.map(row.props.children, (cell, index) => {
        if (!isValidElement(cell) || !['td', 'th'].includes(cell.type)) return cell;
        return cloneElement(cell, {
          className: [cell.props.className, numericColumns.includes(index) ? 'admin-cell-number' : ''].filter(Boolean).join(' '),
          ...(cell.type === 'th' ? { scope: 'col' } : { 'data-label': typeof headings[index] === 'string' ? headings[index] : undefined }),
        });
      }));
    }));
  };
  return <div className={'admin-data-table' + (mobileCards ? ' admin-mobile-cards' : '')}>
    {scrollable && <p className="admin-table-hint"><span aria-hidden="true">↔</span> {tr('Scroll to see all columns')}</p>}
    <div className="admin-table-scroll" ref={scroller} role="region" aria-label={tr(label)} tabIndex={0} data-scrollable={scrollable}>
      <table className={className} ref={table} style={{ '--admin-table-min': `${minWidth}px` }}>{sections.map(decorate)}</table>
    </div>
  </div>;
}

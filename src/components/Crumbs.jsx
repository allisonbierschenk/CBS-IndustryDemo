import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

// items: [{ label, to? }] — the last item is the current page.
export default function Crumbs({ items }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => (
        <Fragment key={`${i}-${c.label}`}>
          {i > 0 && <Icon name="chevronRight" />}
          {c.to && i < items.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
        </Fragment>
      ))}
    </nav>
  );
}

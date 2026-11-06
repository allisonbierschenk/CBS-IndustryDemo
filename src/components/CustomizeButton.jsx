// "Customize" on a dashboard header: opens this Apex template in embedded web authoring (Premium).
// Standard clients see it locked with the upgrade prompt, like the other Premium features.
import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import Icon from './Icon.jsx';

export default function CustomizeButton({ templateKey, title, back }) {
  const { me } = useSession();
  const allowed = me.features?.authoring;
  const to = `/reports/customize/${encodeURIComponent(templateKey)}?title=${encodeURIComponent(title || '')}&back=${encodeURIComponent(back || '/reports')}`;
  if (!allowed) {
    return (
      <span className="btn btn-ghost btn-sm btn-icon is-locked" title="Customize: part of Premium" aria-label="Customize (Premium)" aria-disabled="true">
        <Icon name="edit" />
        <Icon name="lock" className="lock" />
      </span>
    );
  }
  return (
    <Link className="btn btn-ghost btn-sm btn-icon" to={to} aria-label="Customize" title="Customize: open this template in the editor and save your own version">
      <Icon name="edit" />
    </Link>
  );
}

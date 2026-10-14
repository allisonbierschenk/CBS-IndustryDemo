// Demo users grouped by company (with each company's logo) — shared by the login page and the presenter
// dock's Switch account tab so the two always match.
import CompanyLogo from './CompanyLogo.jsx';
import Icon from './Icon.jsx';

/** Users grouped by company, in the order they appear in the user store. */
export function byCompany(personas) {
  const groups = new Map();
  for (const p of personas) {
    if (!groups.has(p.tenantId)) groups.set(p.tenantId, { ...p, users: [] });
    groups.get(p.tenantId).users.push(p);
  }
  return [...groups.values()];
}

// compact: single column (presenter dock). shortcuts: show ⌥1–⌥9 next to each user.
export default function PersonaList({ personas, onPick, currentId, compact = false, shortcuts = false }) {
  const index = new Map(personas.map((p, i) => [p.userId, i + 1]));
  return (
    <div className={`user-list${compact ? ' is-compact' : ''}`}>
      {byCompany(personas).map((c) => (
        <section key={c.tenantId} className="co-group" aria-label={c.clientName}>
          <div className="co-head">
            <CompanyLogo tenantId={c.tenantId} color={c.color} size={36} />
            <div className="co-title">
              <span className="ur-company">{c.clientName}</span>
              <span className="co-industry">{c.industry}</span>
            </div>
            <span className={`mini-tier ${c.tier}`}>{c.tier}</span>
          </div>
          {c.users.map((p) => (
            <button key={p.userId} className="user-row" onClick={() => onPick(p)} aria-current={p.userId === currentId || undefined}>
              <span className="ur-main">
                <span className="ur-name-row">
                  <span className="uc-name">{p.name}</span>
                  {p.persona && p.persona !== 'Executive' && <span className="persona-chip">{p.persona}</span>}
                  {p.userId === currentId && <span className="persona-chip is-current">Signed in</span>}
                </span>
                <span className="ur-meta">
                  {p.title}
                  {p.persona && p.persona !== 'Executive' ? ` · Sees: ${p.scope}` : p.demoFocus ? ` · ${p.demoFocus}` : ''}
                </span>
              </span>
              {shortcuts && index.get(p.userId) <= 9 ? <kbd className="ur-kbd">⌥{index.get(p.userId)}</kbd> : <Icon name="arrowRight" className="ur-go" />}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

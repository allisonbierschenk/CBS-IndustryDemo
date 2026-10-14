// Sign-in: pick a customer user. Clicking signs them in and mints their Tableau JWT.
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import CompanyLogo from '../components/CompanyLogo.jsx';
import Icon from '../components/Icon.jsx';
import { Brand } from '../components/TopBar.jsx';

// Users grouped by company, in the order they appear in the user store.
function byCompany(personas) {
  const groups = new Map();
  for (const p of personas) {
    if (!groups.has(p.tenantId)) groups.set(p.tenantId, { ...p, users: [] });
    groups.get(p.tenantId).users.push(p);
  }
  return [...groups.values()];
}

export default function Login() {
  const { status, signInAs } = useSession();
  const [personas, setPersonas] = useState(null);
  const [error, setError] = useState('');
  const [params] = useSearchParams();
  // Shared links land here as /login?next=<internal path>; anything else goes Home.
  const next = /^\/(?!\/)/.test(params.get('next') || '') ? params.get('next') : null;
  const linkExpired = params.get('link') === 'expired';

  useEffect(() => {
    api('/api/users')
      .then((d) => setPersonas(d.personas))
      .catch((e) => setError(e.message));
  }, []);

  // Every sign-in lands on the home page (agent or dashboards choice).
  if (status === 'authenticated') return <Navigate to={next || '/'} replace />;

  const pick = async (p) => {
    setError('');
    try {
      await signInAs(p, next);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="frame">
      <div className="page">
        <header className="topbar" style={{ gridTemplateColumns: 'auto 1fr' }}>
          <Brand to="/login" />
          <span />
        </header>
        <main className="container">
          <section className="signin">
            <div className="signin-card">
              <h1>Sign in to your client portal</h1>
              <p className="muted">Choose who you are. Each user sees only their own organization&apos;s engagements.</p>
              {next && <div className="notice info" style={{ margin: '0 0 12px' }}>Sign in to open the shared link. You&apos;ll see it with your own data access.</div>}
              {linkExpired && <div className="notice" style={{ margin: '0 0 12px' }}>That shared link has expired or isn&apos;t valid. Ask the sender for a new one.</div>}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="user-list">
                {!personas && !error && <div className="muted">Loading…</div>}
                {personas &&
                  byCompany(personas).map((c) => (
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
                        <button key={p.userId} className="user-row" onClick={() => pick(p)}>
                          <span className="ur-main">
                            <span className="ur-name-row">
                              <span className="uc-name">{p.name}</span>
                              {p.persona && p.persona !== 'Executive' && <span className="persona-chip">{p.persona}</span>}
                            </span>
                            <span className="ur-meta">
                              {p.title}
                              {p.persona && p.persona !== 'Executive' ? ` · Sees: ${p.scope}` : p.demoFocus ? ` · ${p.demoFocus}` : ''}
                            </span>
                          </span>
                          <Icon name="arrowRight" className="ur-go" />
                        </button>
                      ))}
                    </section>
                  ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

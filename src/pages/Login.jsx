// Sign-in: pick a customer user. Clicking signs them in and mints their Tableau JWT.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api, initials } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import Icon from '../components/Icon.jsx';
import { Brand } from '../components/TopBar.jsx';

const INDUSTRY_ICON = {
  'Logistics & Distribution': 'truck',
  Technology: 'chip',
  Healthcare: 'shield',
  Manufacturing: 'factory',
  Energy: 'bolt'
};

export default function Login() {
  const { status, signInAs } = useSession();
  const [personas, setPersonas] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/users')
      .then((d) => setPersonas(d.personas))
      .catch((e) => setError(e.message));
  }, []);

  // Every sign-in lands on the home page (agent or dashboards choice).
  if (status === 'authenticated') return <Navigate to="/" replace />;

  const pick = async (p) => {
    setError('');
    try {
      await signInAs(p);
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
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="user-list">
                {!personas && !error && <div className="muted">Loading…</div>}
                {personas?.map((p) => (
                  <button key={p.userId} className="user-row" onClick={() => pick(p)}>
                    <span className="uc-avatar" style={{ background: p.color }}>
                      {initials(p.name)}
                    </span>
                    <span className="ur-main">
                      <span className="uc-name">{p.name}</span>
                      <span className="ur-meta">
                        <span>{p.title} ·</span>
                        <span className="ur-org">
                          <Icon name={INDUSTRY_ICON[p.industry] || 'grid'} size={12} />
                          <span>
                            <span className="ur-company">{p.clientName}</span>, {p.industry}
                          </span>
                        </span>
                      </span>
                      {p.demoFocus && <span className="uc-focus">{p.demoFocus}</span>}
                    </span>
                    <span className={`mini-tier ${p.tier}`}>{p.tier}</span>
                    <Icon name="arrowRight" className="ur-go" />
                  </button>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

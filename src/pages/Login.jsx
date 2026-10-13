// Sign-in: pick a customer user. Clicking signs them in and mints their Tableau JWT.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api.js';
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
          <section className="login-wrap">
            <div className="login-card">
              <h2>Sign in to your client portal</h2>
              <p>Choose your organization. Each signs in as its own user with access to its own engagements only.</p>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="persona-grid">
                {!personas && !error && <div className="muted">Loading…</div>}
                {personas?.map((p) => (
                  <button key={p.userId} className="persona" onClick={() => pick(p)}>
                    <span className="avatar" style={{ background: p.color }}>{p.monogram}</span>
                    <span>
                      <span className="persona-tags">
                      <span className="industry-tag">
                        <Icon name={INDUSTRY_ICON[p.industry] || 'grid'} size={12} />
                        {p.industry}
                      </span>
                      </span>
                      <b>{p.clientName}</b>
                      <span>
                        {p.name} · {p.title}
                      </span>
                      <span className="persona-email">{p.email}</span>
                      {p.demoFocus && (
                        <span className={`demo-focus${p.hasTransportation ? ' is-transport' : ''}`}>
                          <Icon name={p.hasTransportation ? 'truck' : 'chart'} size={12} />
                          {p.demoFocus}
                        </span>
                      )}
                    </span>
                    <span className={`mini-tier ${p.tier}`}>{p.tier}</span>
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

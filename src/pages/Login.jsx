// Sign-in: pick a customer user. Clicking signs them in and mints their Tableau JWT.
import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import PersonaList from '../components/PersonaList.jsx';
import { Brand } from '../components/TopBar.jsx';

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
              {!personas && !error && <div className="muted">Loading…</div>}
              {personas && <PersonaList personas={personas} onPick={pick} />}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

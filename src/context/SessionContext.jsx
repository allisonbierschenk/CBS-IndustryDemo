// Session state: portal config, the signed-in customer (/api/me), sign-in/out and user switching.
// Signing in (or switching) = a fresh server session for that user + a freshly minted Tableau JWT.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { logJwt } from '../lib/jwtDebug.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', config: null, me: null, error: null });

  const load = useCallback(async () => {
    try {
      const config = await api('/api/config');
      const me = await api('/api/me');
      setState(me.authenticated ? { status: 'authenticated', config, me, error: null } : { status: 'anonymous', config, me: null, error: null });
    } catch (e) {
      setState({ status: 'error', config: null, me: null, error: e.message });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Sign in as a demo user — clicking the user is the whole authentication step. */
  const signInAs = useCallback(
    async (persona, next) => {
      const res = await api('/api/auth/login', { method: 'POST', body: { userId: persona.userId } });
      if (res.token) {
        // Client-side only: log the freshly minted JWT (+ jwt.io link) for the demo.
        logJwt(res.token, `Signed in as ${persona.clientName}`);
        sessionStorage.setItem('apex.lastJwt', JSON.stringify({ label: `Sign-in · ${persona.clientName}`, token: res.token }));
      }
      await load();
      // Home, unless the user arrived through a shared link (internal paths only).
      navigate(next && /^\/(?!\/)/.test(next) ? next : '/', { replace: true });
    },
    [load, navigate]
  );

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' });
    await load();
    navigate('/login', { replace: true });
  }, [load, navigate]);

  const value = useMemo(() => ({ ...state, reload: load, signInAs, signOut }), [state, load, signInAs, signOut]);

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}

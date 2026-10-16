// Demo checkout: a Standard client upgrades to Premium for this session. The server marks the portal session
// upgraded (entitlements + the JWT's subscription tier), so the benchmarks tile and page unlock in place.
// Signing out or switching users resets it. The dialog lives in UpgradeProvider (layout level), so it
// survives the lock that opened it disappearing the moment the upgrade succeeds.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import Icon from './Icon.jsx';

// What Premium adds, framed as the value to the client.
const included = (t) => [
  ['star', 'Know where you stand', `Your percentile against anonymized ${t.industry.toLowerCase()} peers — for every engagement, and how it’s trending.`],
  ['target', 'Know where to invest next', 'See which engagements are furthest from the top quartile, so effort goes where it pays off most.'],
  ['target', 'Set your own goals', 'Create your own metrics with a target — we track your progress and flag when you’re off track.'],
  ['calendar', 'Turn gaps into a plan', 'Benchmark reviews with your Apex team to agree what to change, and by when.'],
  ['chart', 'Answer your own questions', 'Build your own reports in Tableau on the same governed data, with the same security.']
];

const UpgradeContext = createContext(() => {});

export function UpgradeProvider({ children }) {
  const [intent, setIntent] = useState(null); // 'upgrade' | 'learn' | null
  const open = useCallback((i = 'upgrade') => setIntent(i), []);
  return (
    <UpgradeContext.Provider value={open}>
      {children}
      {intent && createPortal(<UpgradeDialog intent={intent} onClose={() => setIntent(null)} />, document.body)}
    </UpgradeContext.Provider>
  );
}

// intent: 'upgrade' (checkout) or 'learn' ("What's included") — same dialog, different heading.
export default function UpgradeButton({ className = 'btn btn-lime btn-sm', label = 'Upgrade', intent = 'upgrade' }) {
  const open = useContext(UpgradeContext);
  return (
    <button className={className} onClick={() => open(intent)}>
      {label}
    </button>
  );
}

function UpgradeDialog({ intent, onClose }) {
  const { me, reload } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState({ kind: 'review' });
  const price = me.features?.benchmarks?.price;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const confirm = async () => {
    setState({ kind: 'working' });
    try {
      const r = await api('/api/upgrade', { method: 'POST' });
      await reload();
      toast(`${me.tenant.shortName} is now on Premium`);
      // Presenter heads-up: the upgrade worked in the portal but Apex's CRM didn't get it.
      if (r.salesforce?.error) toast(r.salesforce.error);
      setState({ kind: 'done' });
    } catch (e) {
      setState({ kind: 'error', message: e.message });
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal upgrade-modal" role="dialog" aria-modal="true" aria-labelledby="up-title">
        <div className="modal-head">
          <div>
            <div className="kicker">{me.tenant.clientName}</div>
            <h3 id="up-title">{state.kind === 'done' ? 'Welcome to Premium' : intent === 'learn' ? 'What’s included with Premium' : 'Upgrade to Premium'}</h3>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {state.kind === 'done' ? (
            <>
              <div className="notice info" style={{ marginTop: 0 }}>
                <Icon name="check" />
                <div>
                  <b>Industry Benchmarks unlocked</b>
                  The benchmarks tile on your dashboard is now live, and the Industry Benchmarks page is open to you.
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={onClose}>
                  Back to dashboard
                </button>
                <button
                  className="btn btn-dark"
                  onClick={() => {
                    onClose();
                    navigate('/benchmarks');
                  }}
                >
                  Open Industry Benchmarks
                  <Icon name="arrowRight" />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="upgrade-pitch">You see the value Apex delivers. Premium shows how it compares — and where to go next.</p>
              <ul className="upgrade-list">
                {included(me.tenant).map(([icon, t, d]) => (
                  <li key={t}>
                    <Icon name={icon} />
                    <span>
                      <b>{t}</b>
                      {d}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="upgrade-plan">
                <span className="mini-tier premium">Premium</span>
                {price && (
                  <div className="upgrade-price">
                    <b>{price}</b>
                  </div>
                )}
              </div>
              {state.kind === 'error' && <div className="error-msg">{state.message}</div>}
              <div className="modal-actions">
                <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>
                  Demo checkout — no charge. Resets when you sign out.
                </span>
                <button className="btn btn-ghost" onClick={onClose}>
                  Not now
                </button>
                <button className="btn btn-dark" onClick={confirm} disabled={state.kind === 'working'}>
                  <Icon name="star" />
                  {state.kind === 'working' ? 'Upgrading…' : 'Confirm upgrade'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

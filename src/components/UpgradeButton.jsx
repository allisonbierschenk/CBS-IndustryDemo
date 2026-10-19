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
  ['agent', 'Ask your data anything', 'The Agent answers questions about your metrics in plain English — what changed, why, and what to look at next.'],
  ['star', 'Know where you stand', `Your percentile against anonymized ${t.industry.toLowerCase()} peers — for every engagement, and how it’s trending.`],
  ['target', 'Know where to invest next', 'See which engagements are furthest from the top quartile, so effort goes where it pays off most.'],
  ['target', 'Set your own goals', 'Create your own metrics with a target — we track your progress and flag when you’re off track.'],
  ['calendar', 'Turn gaps into a plan', 'Benchmark reviews with your Apex team to agree what to change, and by when.'],
  ['chart', 'Answer your own questions', 'Build your own reports in Tableau on the same governed data, with the same security.']
];

const UpgradeContext = createContext(() => {});

/** Open the upgrade dialog from anywhere: useUpgrade()('upgrade' | 'learn'). */
export const useUpgrade = () => useContext(UpgradeContext);

export function UpgradeProvider({ children }) {
  const [intent, setIntent] = useState(null); // 'upgrade' | 'learn' | null
  const open = useCallback((i = 'upgrade') => setIntent(i), []);
  return (
    <UpgradeContext.Provider value={open}>
      {children}
      {intent && createPortal(<UpgradeSwitch intent={intent} onClose={() => setIntent(null)} />, document.body)}
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

// Portal admins (e.g. Dana) buy Premium seats for named people; everyone else upgrades the whole company.
function UpgradeSwitch({ intent, onClose }) {
  const { me } = useSession();
  return me.features?.seats && intent === 'upgrade' ? <SeatsDialog onClose={onClose} /> : <UpgradeDialog intent={intent} onClose={onClose} />;
}

const money = (n) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

function SeatsDialog({ onClose }) {
  const { me, reload } = useSession();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [state, setState] = useState({ kind: 'review' });

  useEffect(() => {
    api('/api/seats')
      .then((d) => {
        setData(d); // nobody pre-selected — the presenter clicks “All managers” on camera
      })
      .catch((e) => setState({ kind: 'error', message: e.message }));
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const people = data?.people || [];
  const open = people.filter((p) => !p.seat);
  const managers = open.filter((p) => p.manager);
  const shown = people.filter((p) => !q || `${p.name} ${p.title}`.toLowerCase().includes(q.toLowerCase()));
  const per = Number(String(data?.price || '').replace(/[^0-9.]/g, '')) || 0;
  const n = picked.size;
  const toggle = (id) => setPicked((s) => { const t = new Set(s); t.has(id) ? t.delete(id) : t.add(id); return t; });

  const confirm = async () => {
    setState({ kind: 'working' });
    try {
      const r = await api('/api/seats', { method: 'POST', body: { contactIds: [...picked] } });
      await reload();
      toast(`${r.seats} Premium seat${r.seats === 1 ? '' : 's'} added`);
      setState({ kind: 'done', ...r, names: people.filter((p) => picked.has(p.contactId)).map((p) => p.name) });
    } catch (e) {
      setState({ kind: 'error', message: e.message });
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal upgrade-modal seats-modal" role="dialog" aria-modal="true" aria-labelledby="seats-title">
        <div className="modal-head">
          <div>
            <div className="kicker">{me.tenant.clientName}</div>
            <h3 id="seats-title">{state.kind === 'done' ? 'Your team is on Premium' : 'Upgrade your team to Premium'}</h3>
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
                  <b>
                    {state.seats} Premium seat{state.seats === 1 ? '' : 's'} · {money(state.amount)}/yr
                  </b>
                  {state.names.slice(0, 3).join(', ')}
                  {state.names.length > 3 ? ` and ${state.names.length - 3} others` : ''} now have Industry Benchmarks, the Agent and goals. They’ll see it the next time they
                  sign in.
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-dark" onClick={onClose}>
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="upgrade-pitch">Give the people who run the work Premium: benchmarks, the Agent and their own goals. Pay only for the seats you assign.</p>
              {!data && state.kind !== 'error' && <p className="muted">Loading your team…</p>}
              {data && (
                <>
                  <div className="seats-tools">
                    <button className="chip-btn" onClick={() => setPicked(new Set(managers.map((p) => p.contactId)))}>
                      All managers ({managers.length})
                    </button>
                    {data.activityFrom && (
                      <button className="chip-btn" onClick={() => setPicked(new Set([...open].sort((a, b) => (b.visits || 0) - (a.visits || 0)).slice(0, 20).map((p) => p.contactId)))}>
                        Most active (20)
                      </button>
                    )}
                    <button className="chip-btn" onClick={() => setPicked(new Set(open.map((p) => p.contactId)))}>
                      Everyone ({open.length})
                    </button>
                    <button className="chip-btn" onClick={() => setPicked(new Set())}>
                      Clear
                    </button>
                    <input className="input seats-search" placeholder="Search people or titles" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
                  </div>
                  {data.activityFrom && <p className="seats-note">Portal visits in the last 30 days, from {data.activityFrom}.</p>}
                  <ul className="seats-list">
                    {shown.map((p) => (
                      <li key={p.contactId}>
                        <label className={p.seat ? 'is-seated' : ''}>
                          <input type="checkbox" checked={p.seat || picked.has(p.contactId)} disabled={p.seat} onChange={() => toggle(p.contactId)} />
                          <span className="seats-name">
                            <b>{p.name}</b>
                            <small>{p.title}</small>
                          </span>
                          {p.visits != null && (
                            <span className={`seats-visits${p.visits ? '' : ' is-zero'}`} title="Portal visits in the last 30 days, from Data 360">
                              {p.visits} visit{p.visits === 1 ? '' : 's'}
                            </span>
                          )}
                          {p.manager && <span className="persona-chip">Manager</span>}
                          {p.seat && <span className="mini-tier premium">Premium</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="upgrade-plan seats-total">
                    <span>
                      <b>{n}</b> seat{n === 1 ? '' : 's'} × {data.price}
                    </span>
                    <div className="upgrade-price">
                      <b>{money(n * per)}/month</b>
                      <small> · {money(n * per * 12)}/yr</small>
                    </div>
                  </div>
                </>
              )}
              {state.kind === 'error' && <div className="error-msg">{state.message}</div>}
              <div className="modal-actions">
                <span className="muted" style={{ marginRight: 'auto', fontSize: 12 }}>
                  Demo checkout — no charge.
                </span>
                <button className="btn btn-ghost" onClick={onClose}>
                  Not now
                </button>
                <button className="btn btn-dark" onClick={confirm} disabled={!n || state.kind === 'working'}>
                  <Icon name="star" />
                  {state.kind === 'working' ? 'Upgrading…' : `Upgrade ${n} ${n === 1 ? 'person' : 'people'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
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

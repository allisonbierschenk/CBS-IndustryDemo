// Presenter controls: secure persona switching, talk track, and "under the hood" JWT claims.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import CompanyLogo from './CompanyLogo.jsx';
import Icon from './Icon.jsx';
import PersonaList, { byCompany } from './PersonaList.jsx';
import { decodeJwt, jwtIoUrl } from '../lib/jwtDebug.js';

const TABS = [
  ['switch', 'Switch account'],
  ['talk', 'Talk track'],
  ['hood', 'Under the hood']
];

export default function PresenterDock() {
  const { me, signInAs } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('switch');
  const [personas, setPersonas] = useState([]);
  const [token, setToken] = useState(() => {
    try {
      return { last: JSON.parse(sessionStorage.getItem('apex.lastJwt')), count: 0 };
    } catch {
      return { last: null, count: 0 };
    }
  });
  const t = me.tenant;

  useEffect(() => {
    api('/api/users')
      .then((d) => setPersonas(byCompany(d.personas).flatMap((c) => c.users))) // ⌥1–⌥9 follow the on-screen order
      .catch(() => setPersonas([]));
  }, []);

  useEffect(() => {
    const onToken = (e) => setToken((s) => ({ last: e.detail, count: s.count + 1 }));
    window.addEventListener('apex:token', onToken);
    return () => window.removeEventListener('apex:token', onToken);
  }, []);

  const go = (p) => {
    if (!p || p.userId === me.user.id) return;
    setOpen(false);
    signInAs(p).catch((e) => toast(`Switch failed: ${e.message}`));
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!e.altKey) return;
      if (e.code === 'KeyP') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      const m = /^Digit([1-9])$/.exec(e.code);
      if (m && personas[Number(m[1]) - 1]) {
        e.preventDefault();
        go(personas[Number(m[1]) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <button className="dock-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <CompanyLogo tenantId={t.id} color={t.color} size={30} />
        Switch user · {t.shortName}
      </button>
      <section className={`dock${open ? ' open' : ''}`} aria-label="Presenter controls">
        <div className="dock-head">
          <div className="kicker">
            Demo controls
            <a href="/guide" target="_blank" rel="noreferrer" className="dock-guide">
              Demo guide ↗
            </a>
          </div>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div className="dock-body">
          {tab === 'switch' && <SwitchTab personas={personas} currentId={me.user.id} onPick={go} />}
          {tab === 'talk' && <TalkTab tenant={t} />}
          {tab === 'hood' && <HoodTab me={me} token={token} />}
        </div>
      </section>
    </>
  );
}

function SwitchTab({ personas, currentId, onPick }) {
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 8px' }}>
        Each switch ends the current session and signs in as a separately authorized customer. Tableau JWTs are re-minted
        with the new user's email as <span className="code-inline">sub</span>.
      </p>
      <ResetGoals />
      <PersonaList personas={personas} currentId={currentId} onPick={onPick} compact />
    </>
  );
}

function TalkTab({ tenant }) {
  const n = tenant.presenterNotes || {};
  return (
    <div className="talk">
      <div className="kicker">{tenant.clientName}</div>
      <p style={{ margin: '6px 0 0' }}>{n.story}</p>
      <h4>Talk track</h4>
      <ol>
        {(n.scenes || []).map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {n.message && <blockquote>“{n.message}”</blockquote>}
      <h4>Closing</h4>
      <p>
        Stronger client transparency &amp; trust · differentiated services · better renewal and expansion conversations ·
        scalable external analytics · premium revenue. <b>“Turn services delivered into value demonstrated.”</b>
      </p>
    </div>
  );
}

function HoodTab({ me, token }) {
  const claim = me.attributeClaim;
  const attrClaims = new Set(me.attributeClaims || [claim]);
  const last = token.last?.token ? { ...token.last, ...decodeJwt(token.last.token) } : null;
  const entries = last ? Object.entries(last.payload) : [];
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
        Latest Connected App JWT, decoded in the browser (Direct Trust, HS256 — signed server-side; the secret never reaches the
        browser). Every token is also logged to the browser console. Tokens minted on this page: <b>{token.count}</b>.
      </p>
      {last && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="code-inline">{last.label}</span>
          <a className="btn btn-dark btn-sm" href={jwtIoUrl(last.token)} target="_blank" rel="noreferrer">
            Open in jwt.io ↗
          </a>
        </div>
      )}
      <div className="claims">
        {last ? (
          <>
            {'{\n'}
            {entries.map(([k, v], i) => (
              <span key={k}>
                {'  '}
                <span className="k">{JSON.stringify(k)}</span>:{' '}
                <span className={attrClaims.has(k) || k === 'sub' ? 'hl' : ''}>{JSON.stringify(v)}</span>
                {i < entries.length - 1 ? ',\n' : '\n'}
              </span>
            ))}
            {'}'}
          </>
        ) : (
          'No token yet — sign in or open a dashboard.'
        )}
      </div>
      <h4 style={{ fontSize: 13, margin: '16px 0 6px' }}>Row-level security in Tableau</h4>
      <p style={{ fontSize: 12.5, margin: 0 }}>Dashboard charts — data source filter (keep True):</p>
      <div className="claims" style={{ marginTop: 6 }}>
        USERATTRIBUTEINCLUDES(<span className="hl">'{claim}'</span>, [Client Name])
      </div>
      <p style={{ fontSize: 12.5, margin: '10px 0 0' }}>Premium-only content (e.g. benchmarks sheet) — filter (keep True):</p>
      <div className="claims" style={{ marginTop: 6 }}>
        USERATTRIBUTEINCLUDES(<span className="hl">'subscription tier'</span>, 'Premium')
      </div>
      <p style={{ fontSize: 12.5, margin: '10px 0 0' }}>Pulse KPI cards — published data source filter:</p>
      <div className="claims" style={{ marginTop: 6 }}>
        USERNAME() = [Tableau Username] <span className="k">// = JWT sub</span>
      </div>
      <h4 style={{ fontSize: 13, margin: '16px 0 6px' }}>Server-side entitlements</h4>
      <p style={{ fontSize: 12.5, margin: 0 }}>
        {me.entitlements.length
          ? me.entitlements.map((e) => (
              <span key={e} className="code-inline" style={{ marginRight: 6 }}>
                {e}
              </span>
            ))
          : 'Standard only — no add-on entitlements.'}
      </p>
    </>
  );
}

/** Demo clean-up: delete every goal metric the signed-in client created (only their own — never shared ones). */
function ResetGoals() {
  const { me } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!me.features?.pulseGoals) return null;
  const reset = async () => {
    if (!window.confirm(`Delete every goal metric ${me.user.name} created? This removes them from Tableau.`)) return;
    setBusy(true);
    try {
      const r = await api('/api/metrics/reset-goals', { method: 'POST' });
      toast(r.deleted ? `Deleted ${r.deleted} goal metric${r.deleted > 1 ? 's' : ''}${r.failed ? ` (${r.failed} couldn’t be deleted)` : ''}` : 'No goal metrics to delete');
    } catch (e) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="dock-reset">
      <span>
        <b>Clean up</b> Delete the goals {me.user.name.split(' ')[0]} created during this demo.
      </span>
      <button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>
        {busy ? 'Deleting…' : 'Reset demo goals'}
      </button>
    </div>
  );
}

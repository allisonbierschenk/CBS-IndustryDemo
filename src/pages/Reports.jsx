// Report library — every Tableau view this customer may open, with thumbnails and Tableau favorites.
// The list comes from Tableau (REST, as the signed-in user) and is limited to entitled workbooks.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import Crumbs from '../components/Crumbs.jsx';
import Icon from '../components/Icon.jsx';
import InfoTip from '../components/InfoTip.jsx';

export default function Reports() {
  const { me } = useSession();
  const [state, setState] = useState({ loading: true });
  const [onlyFavs, setOnlyFavs] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    api('/api/library')
      .then((d) => setState({ views: d.views }))
      .catch((e) => setState({ error: e.message }));
  }, []);

  const toggleFav = async (v) => {
    const on = !v.favorite;
    setState((s) => ({ ...s, views: s.views.map((x) => (x.id === v.id ? { ...x, favorite: on } : x)) }));
    try {
      await api(`/api/library/${v.id}/favorite`, { method: on ? 'PUT' : 'DELETE' });
    } catch (e) {
      setState((s) => ({ ...s, views: s.views.map((x) => (x.id === v.id ? { ...x, favorite: !on } : x)), flash: e.message }));
    }
  };

  const groups = useMemo(() => {
    const list = (state.views || []).filter((v) => (!onlyFavs || v.favorite) && (!q || `${v.name} ${v.workbook}`.toLowerCase().includes(q.toLowerCase())));
    const by = new Map();
    for (const v of [...list].sort((a, b) => Number(b.favorite) - Number(a.favorite))) by.set(v.workbook, [...(by.get(v.workbook) || []), v]);
    return [...by.entries()];
  }, [state.views, onlyFavs, q]);

  return (
    <div className="container">
      <Crumbs items={[{ label: 'Home', to: '/' }, { label: 'Reports' }]} />
      <div className="page-head">
        <div>
          <div className="title-row">
            <h1>Reports</h1>
            <InfoTip kind="reports" label="About Reports" />
          </div>
          <p className="lead">Every report available to {me.tenant.shortName}. Star the ones you use most.</p>
        </div>
        {me.features?.authoring && (
          <Link className="btn btn-dark" to="/reports/new">
            <Icon name="chart" />
            Build your own report
          </Link>
        )}
      </div>

      <div className="lib-tools">
        <div className="lib-search">
          <Icon name="search" />
          <input className="input" placeholder="Search reports" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" />
        </div>
        <div className="seg" role="radiogroup" aria-label="Show" style={{ marginBottom: 0 }}>
          <button role="radio" aria-checked={!onlyFavs} onClick={() => setOnlyFavs(false)}>
            All
          </button>
          <button role="radio" aria-checked={onlyFavs} onClick={() => setOnlyFavs(true)}>
            Favorites
          </button>
        </div>
      </div>

      {state.loading && <p className="muted">Loading your reports from Tableau…</p>}
      {state.error && <div className="error-msg">{state.error}</div>}
      {state.flash && <div className="error-msg">{state.flash}</div>}
      {state.views && groups.length === 0 && <p className="muted">{onlyFavs ? 'No favorites yet — star a report to pin it here.' : 'No reports match.'}</p>}

      {groups.map(([workbook, views]) => (
        <section className="section" key={workbook} style={{ paddingTop: 12 }}>
          <h2 className="section-title" style={{ fontSize: 20, marginBottom: 14 }}>
            {workbook}
          </h2>
          <div className="lib-grid">
            {views.map((v) => (
              <article className="lib-card" key={v.id}>
                {/* Tableau doesn't render preview images for row-level-secured ("user specific") views, so cards use a tile. */}
                <Link to={`/reports/${v.id}`} className="lib-thumb" aria-hidden="true" tabIndex={-1}>
                  <Icon name={/dashboard/i.test(v.name) ? 'dashboard' : 'chart'} />
                </Link>
                <div className="lib-meta">
                  <Link to={`/reports/${v.id}`}>
                    <b>{v.name}</b>
                  </Link>
                  <button className={`icon-btn lib-star${v.favorite ? ' is-on' : ''}`} aria-pressed={v.favorite} aria-label={v.favorite ? `Remove ${v.name} from favorites` : `Add ${v.name} to favorites`} onClick={() => toggleFav(v)}>
                    <Icon name="star" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// "Email me this dashboard" — creates a Tableau Cloud subscription for the signed-in user (REST API).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import Icon from './Icon.jsx';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function SubscribeButton({ viewKey, title }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Email this dashboard on a schedule">
        <Icon name="mail" />
        Subscribe
      </button>
      {open && <SubscribeDialog viewKey={viewKey} title={title} onClose={() => setOpen(false)} />}
    </>
  );
}

function SubscribeDialog({ viewKey, title, onClose }) {
  const [form, setForm] = useState({ frequency: 'Weekly', weekDay: 'Monday', monthDay: '1', time: '08:00', attachment: 'pdf' });
  const [state, setState] = useState({ kind: 'editing' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setState({ kind: 'saving' });
    try {
      const r = await api('/api/subscriptions', { method: 'POST', body: { viewKey, ...form } });
      setState({ kind: 'done', nextRunAt: r.nextRunAt });
    } catch (err) {
      setState({ kind: 'error', message: err.message });
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="sub-title">
        <div className="modal-head">
          <div>
            <div className="kicker">{title}</div>
            <h3 id="sub-title">Email me this dashboard</h3>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {state.kind === 'done' ? (
          <div className="modal-body">
            <div className="notice info" style={{ marginTop: 0 }}>
              <Icon name="check" />
              <div>
                <b>Subscribed</b>
                {state.nextRunAt ? `First delivery ${new Date(state.nextRunAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Your subscription is scheduled.'} Each email shows your own data.
              </div>
            </div>
            <div className="modal-actions">
              <Link className="btn btn-ghost" to="/alerts" onClick={onClose}>
                Manage subscriptions
              </Link>
              <button className="btn btn-dark" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form className="modal-body" onSubmit={submit}>
            <div className="seg" role="radiogroup" aria-label="Frequency">
              {['Daily', 'Weekly', 'Monthly'].map((f) => (
                <button type="button" key={f} role="radio" aria-checked={form.frequency === f} onClick={() => setForm((x) => ({ ...x, frequency: f }))}>
                  {f}
                </button>
              ))}
            </div>
            <div className="ex-grid">
              {form.frequency === 'Weekly' && (
                <div className="field">
                  <label htmlFor="sub-day">Day</label>
                  <select id="sub-day" className="input" value={form.weekDay} onChange={set('weekDay')}>
                    {DAYS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}
              {form.frequency === 'Monthly' && (
                <div className="field">
                  <label htmlFor="sub-mday">Day of month</label>
                  <select id="sub-mday" className="input" value={form.monthDay} onChange={set('monthDay')}>
                    {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                    <option value="LastDay">Last day</option>
                  </select>
                </div>
              )}
              <div className="field">
                <label htmlFor="sub-time">Time</label>
                <select id="sub-time" className="input" value={form.time} onChange={set('time')}>
                  {Array.from({ length: 24 }, (_, h) => ['00', '30'].map((m) => `${String(h).padStart(2, '0')}:${m}`)).flat().map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sub-att">Attachment</label>
                <select id="sub-att" className="input" value={form.attachment} onChange={set('attachment')}>
                  <option value="pdf">PDF</option>
                  <option value="image">Image</option>
                </select>
              </div>
            </div>
            {state.kind === 'error' && <div className="error-msg">{state.message}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-dark" disabled={state.kind === 'saving'}>
                <Icon name="mail" />
                {state.kind === 'saving' ? 'Subscribing…' : 'Subscribe'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

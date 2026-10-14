// Thin JSON fetch wrapper (same-origin, cookies included).
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status})`);
  return data;
}

export const initials = (name) =>
  String(name).split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export const formatMonth = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Record a portal activity event (fire-and-forget; never blocks the UI). */
export function track(type, detail = {}) {
  fetch('/api/activity', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, detail }) }).catch(() => {});
}

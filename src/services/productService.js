import { API_URL } from '../config';

export async function productRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}`, ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status}). Please retry.`);
  return data;
}

export function sampleEvent(name) {
  try {
    let visitor = localStorage.getItem('cerbyl.sample.visitor');
    if (!visitor) { visitor = crypto.randomUUID(); localStorage.setItem('cerbyl.sample.visitor', visitor); }
    fetch(`${API_URL}/product/sample-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: visitor, name }) }).catch(() => {});
  } catch (_) { /* The sample remains usable without browser storage or analytics. */ }
}

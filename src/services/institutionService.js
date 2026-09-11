import { apiRequest, API_URL } from '../config/api';
export const institution = (path, body, method = 'POST') => apiRequest(`/institution${path}`, body === undefined ? {} : { method, body: JSON.stringify(body) });
export async function downloadInstitution(path, filename) {
  const response = await fetch(`${API_URL}/institution${path}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  if (!response.ok) throw new Error('Export could not be downloaded. Try again.');
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// CSV is deliberately limited to the documented one-column roster template.
export function parseRoster(text) {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(r => r.trim()).filter(Boolean);
  if (rows[0]?.toLowerCase() === 'email') rows.shift();
  const emails = rows.map(r => r.replace(/^"([^"\r\n]+)"$/, '$1').trim().toLowerCase());
  if (!emails.length || emails.length > 200 || emails.some(e => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e))) throw new Error('Use a CSV with one email column and 1–200 valid email addresses.');
  if (new Set(emails).size !== emails.length) throw new Error('Remove duplicate email addresses before importing.');
  return emails;
}

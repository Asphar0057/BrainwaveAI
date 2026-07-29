import { API_URL } from '../config/api';

const resolveUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const apiOrigin = API_URL.replace(/\/api\/?$/, '');
  return `${apiOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
};

export const isProtectedClassroomFile = (url = '') => {
  try {
    const apiBase = new URL(API_URL, window.location.origin);
    const candidate = new URL(url, apiBase.origin);
    return (
      candidate.origin === apiBase.origin
      && candidate.pathname.startsWith('/api/institution/files/')
    );
  } catch {
    return false;
  }
};

export async function downloadClassroomFile(url, fallbackName = 'classroom-file') {
  if (!isProtectedClassroomFile(url)) {
    throw new Error('Only Cerbyl classroom files can use authenticated download.');
  }
  const token = localStorage.getItem('token');
  const response = await fetch(resolveUrl(url), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    let message = 'The file could not be downloaded.';
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {
      // Keep the fallback for non-JSON responses.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

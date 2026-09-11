import { useCallback, useEffect, useState } from 'react';

export default function useInstitutionSidebar() {
  const [open, setOpen] = useState(() => {
    if (window.matchMedia?.('(max-width: 720px)')?.matches) return false;
    try { return sessionStorage.getItem('cerbyl.institution.sidebarOpen') !== 'false'; }
    catch { return true; }
  });
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 720px)');
    const resize = event => { if (event.matches) setOpen(false); };
    query?.addEventListener?.('change', resize);
    return () => query?.removeEventListener?.('change', resize);
  }, []);
  const update = useCallback(value => {
    setOpen(value);
    try { sessionStorage.setItem('cerbyl.institution.sidebarOpen', String(value)); } catch { /* Keep navigation usable without storage. */ }
  }, []);
  return [open, update];
}

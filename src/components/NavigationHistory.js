import { createContext, useContext, useLayoutEffect, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const NavigationHistory = createContext(null);
export function updateNavigationHistory(history, location, action) {
  const current = { key: location.key, pathname: location.pathname, search: location.search, hash: location.hash };
  const found = history.entries.findIndex(entry => entry.key === location.key);
  if (found >= 0) return { ...history, index: found };
  if (action === 'REPLACE' && history.index >= 0) {
    const entries = [...history.entries];
    entries[history.index] = current;
    return { entries, index: history.index };
  }
  const entries = [...history.entries.slice(0, history.index + 1), current];
  return { entries, index: entries.length - 1 };
}
export function NavigationHistoryProvider({ children }) {
  const location = useLocation();
  const action = useNavigationType();
  const [history, setHistory] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('cerbyl.navigation'));
      if (Array.isArray(saved?.entries) && saved.entries.some(entry => entry.key === location.key)) return saved;
    } catch { /* Fresh tabs start a new navigation trail. */ }
    return { entries: [], index: -1 };
  });
  const current = updateNavigationHistory(history, location, action);
  useLayoutEffect(() => {
    setHistory(current);
    try { sessionStorage.setItem('cerbyl.navigation', JSON.stringify(current)); } catch { /* Optional persistence. */ }
  // Only committed route changes become history; blocked navigation is excluded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key, location.pathname, location.search]);
  let previous = null;
  for (let index = current.index - 1; index >= 0; index -= 1) {
    const entry = current.entries[index];
    if (entry.pathname !== location.pathname && !['/', '/login', '/register'].includes(entry.pathname)) {
      previous = { ...entry, delta: index - current.index };
      break;
    }
  }
  return <NavigationHistory.Provider value={previous}>{children}</NavigationHistory.Provider>;
}
export const usePreviousPage = () => useContext(NavigationHistory);

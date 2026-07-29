import { apiRequest } from '../config/api';

export const ACCOUNT_SESSION_KEY = 'cerbyl.accountSession';
const ACCOUNT_SESSION_USERNAME_KEY = 'browser_username';
const ACCOUNT_SESSION_TOKEN_KEY = 'browser_token';

export const getCachedAccountSession = () => {
  try {
    const cached = JSON.parse(sessionStorage.getItem(ACCOUNT_SESSION_KEY) || 'null');
    if (!cached) return null;

    const activeUsername = localStorage.getItem('username') || '';
    const activeToken = localStorage.getItem('token') || '';
    if (
      !activeUsername
      || !activeToken
      || !cached[ACCOUNT_SESSION_USERNAME_KEY]
      || cached[ACCOUNT_SESSION_USERNAME_KEY] !== activeUsername
      || !cached[ACCOUNT_SESSION_TOKEN_KEY]
      || cached[ACCOUNT_SESSION_TOKEN_KEY] !== activeToken
    ) {
      sessionStorage.removeItem(ACCOUNT_SESSION_KEY);
      return null;
    }
    return cached;
  } catch (_) {
    sessionStorage.removeItem(ACCOUNT_SESSION_KEY);
    return null;
  }
};

export const cacheAccountSession = (session) => {
  const activeUsername = localStorage.getItem('username') || '';
  const activeToken = localStorage.getItem('token') || '';
  const cached = {
    ...session,
    [ACCOUNT_SESSION_USERNAME_KEY]: activeUsername,
    [ACCOUNT_SESSION_TOKEN_KEY]: activeToken,
  };
  sessionStorage.setItem(ACCOUNT_SESSION_KEY, JSON.stringify(cached));
  return cached;
};

export const fetchAccountSession = async ({ force = false } = {}) => {
  if (!force) {
    const cached = getCachedAccountSession();
    if (cached?.role && cached?.landing_route) return cached;
  }

  const requestUsername = localStorage.getItem('username') || '';
  const requestToken = localStorage.getItem('token') || '';
  const session = await apiRequest('/institution/session');
  if (
    localStorage.getItem('username') !== requestUsername
    || localStorage.getItem('token') !== requestToken
  ) {
    throw new Error('Account changed while the session was loading.');
  }
  return cacheAccountSession(session);
};

export const clearAccountSession = () => {
  sessionStorage.removeItem(ACCOUNT_SESSION_KEY);
};

export const getRoleRoute = (role, learnerRoute = '/dashboard-cerbyl') => {
  if (role === 'student') return '/student';
  if (role === 'educator') return '/educator';
  return learnerRoute;
};

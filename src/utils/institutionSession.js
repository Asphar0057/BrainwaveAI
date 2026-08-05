import { apiRequest } from '../config/api';

export const ACCOUNT_SESSION_KEY = 'cerbyl.accountSession';
const ACCOUNT_SESSION_USERNAME_KEY = 'browser_username';
const ACCOUNT_SESSION_TOKEN_KEY = 'browser_token';
const ACCOUNT_SESSION_TIMEOUT_MS = 12000;
const VALID_ACCOUNT_ROLES = new Set(['learner', 'student', 'educator']);
const ROLE_LANDING_ROUTES = {
  learner: '/dashboard',
  student: '/student',
  educator: '/educator',
};

const normalizeAccountRole = (role) => (
  VALID_ACCOUNT_ROLES.has(role) ? role : 'learner'
);

const requestAccountEndpoint = async (endpoint) => {
  if (typeof AbortController === 'undefined') return apiRequest(endpoint);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ACCOUNT_SESSION_TIMEOUT_MS);
  try {
    return await apiRequest(endpoint, { signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Account lookup timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeSession = (session, { legacyBackend = false } = {}) => {
  const role = normalizeAccountRole(session?.role ?? session?.account_role);
  return {
    ...session,
    role,
    landing_route: ROLE_LANDING_ROUTES[role],
    memberships: Array.isArray(session?.memberships) ? session.memberships : [],
    ...(legacyBackend && { legacy_backend: true }),
  };
};

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
  let session;
  try {
    session = normalizeSession(await requestAccountEndpoint('/institution/session'));
  } catch (error) {
    if (error?.status !== 404) throw error;

    // Older deployed backends predate institution workspaces. Their authenticated
    // /me response is still authoritative; absent role data means the original
    // consumer experience, which is the learner workspace.
    const user = await requestAccountEndpoint('/me');
    session = normalizeSession(
      {
        account_role: user?.account_role,
        user,
        memberships: [],
      },
      { legacyBackend: true }
    );
  }
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

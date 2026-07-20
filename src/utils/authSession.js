import { signOut } from 'firebase/auth';
import { auth, authPersistenceReady } from '../firebase/config';
import { clearBackendSession } from './backendSession';

export const GOOGLE_AUTO_SIGN_IN_KEY = 'cerbyl.googleAutoSignIn';
const AUTH_API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const BACKEND_TOKEN_REFRESH_SKEW_SECONDS = 5 * 60;

let googleBackendRestorePromise = null;

export const enableGoogleAutoSignIn = () => {
  localStorage.setItem(GOOGLE_AUTO_SIGN_IN_KEY, 'true');
};

export const canRestoreGoogleSession = () =>
  localStorage.getItem(GOOGLE_AUTO_SIGN_IN_KEY) === 'true';

export const getPersistedGoogleUser = async () => {
  if (!canRestoreGoogleSession()) return null;

  await authPersistenceReady;
  await auth.authStateReady();
  return auth.currentUser;
};

export const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') return null;
  const [, payload] = token.split('.');
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = decodeURIComponent(
      atob(padded)
        .split('')
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
};

export const getBackendTokenExpiryMs = (token) => {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp);
  return Number.isFinite(exp) ? exp * 1000 : null;
};

export const isBackendTokenUsable = (token, nowMs = Date.now()) => {
  const expiresAtMs = getBackendTokenExpiryMs(token);
  if (!expiresAtMs) return false;
  return expiresAtMs - nowMs > BACKEND_TOKEN_REFRESH_SKEW_SECONDS * 1000;
};

export const hasUsableBackendSession = () => {
  const token = localStorage.getItem('token');
  const username = localStorage.getItem('username');
  return Boolean(token && username && isBackendTokenUsable(token));
};

export const storeGoogleBackendSession = (accessToken, user) => {
  localStorage.setItem('token', accessToken);
  localStorage.setItem('username', user.email);
  localStorage.setItem('userProfile', JSON.stringify({
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    picture: user.picture_url,
    googleUser: true,
  }));
};

export const restoreGoogleBackendSession = async () => {
  if (googleBackendRestorePromise) return googleBackendRestorePromise;

  googleBackendRestorePromise = (async () => {
    const user = await getPersistedGoogleUser();
    if (!user) return null;

    const idToken = await user.getIdToken(true);
    const response = await fetch(`${AUTH_API_URL}/firebase-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        uid: user.uid,
      }),
    });

    if (!response.ok) {
      throw new Error('Could not refresh Google backend session');
    }

    const data = await response.json();
    storeGoogleBackendSession(data.access_token, data.user);
    return data.user;
  })().finally(() => {
    googleBackendRestorePromise = null;
  });

  return googleBackendRestorePromise;
};

export const signOutAppSession = async () => {
  localStorage.removeItem(GOOGLE_AUTO_SIGN_IN_KEY);
  clearBackendSession();

  await authPersistenceReady;
  await signOut(auth).catch(() => {});
};

import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/config';
import {
  canRestoreGoogleSession,
  getBackendTokenExpiryMs,
  enableGoogleAutoSignIn,
  getPersistedGoogleUser,
  GOOGLE_AUTO_SIGN_IN_KEY,
  hasUsableBackendSession,
  isBackendTokenUsable,
  restoreGoogleBackendSession,
  signOutAppSession,
  storeGoogleBackendSession,
} from '../../utils/authSession';

jest.mock('firebase/auth', () => ({
  signOut: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../firebase/config', () => ({
  auth: {
    authStateReady: jest.fn(() => Promise.resolve()),
    currentUser: null,
  },
  authPersistenceReady: Promise.resolve(),
}));

const jwtWithExp = (expSeconds) => {
  const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: expSeconds })}.signature`;
};

describe('Google auth session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    auth.currentUser = null;
    auth.authStateReady.mockClear();
    signOut.mockResolvedValue(undefined);
    global.fetch = jest.fn();
  });

  it('only restores Firebase after a successful Google sign-in opted in', async () => {
    auth.currentUser = { uid: 'firebase-user' };

    expect(canRestoreGoogleSession()).toBe(false);
    await expect(getPersistedGoogleUser()).resolves.toBeNull();
    expect(auth.authStateReady).not.toHaveBeenCalled();

    enableGoogleAutoSignIn();

    expect(localStorage.getItem(GOOGLE_AUTO_SIGN_IN_KEY)).toBe('true');
    await expect(getPersistedGoogleUser()).resolves.toBe(auth.currentUser);
    expect(auth.authStateReady).toHaveBeenCalledTimes(1);
  });

  it('stores a renewed backend session for the Google user', () => {
    storeGoogleBackendSession('backend-token', {
      email: 'learner@example.com',
      first_name: 'Ada',
      last_name: 'Lovelace',
      picture_url: 'https://example.com/avatar.png',
    });

    expect(localStorage.getItem('token')).toBe('backend-token');
    expect(localStorage.getItem('username')).toBe('learner@example.com');
    expect(JSON.parse(localStorage.getItem('userProfile'))).toMatchObject({
      email: 'learner@example.com',
      googleUser: true,
    });
  });

  it('does not treat expired backend JWTs as usable sessions', () => {
    const nowMs = Date.now();
    const expiredToken = jwtWithExp(Math.floor((nowMs - 60_000) / 1000));
    const freshToken = jwtWithExp(Math.floor((nowMs + 60 * 60_000) / 1000));

    expect(getBackendTokenExpiryMs(expiredToken)).toBeLessThan(nowMs);
    expect(isBackendTokenUsable(expiredToken, nowMs)).toBe(false);
    expect(isBackendTokenUsable(freshToken, nowMs)).toBe(true);

    localStorage.setItem('token', expiredToken);
    localStorage.setItem('username', 'learner@example.com');
    expect(hasUsableBackendSession()).toBe(false);
  });

  it('refreshes the backend session from a remembered Google user', async () => {
    enableGoogleAutoSignIn();
    auth.currentUser = {
      uid: 'firebase-user',
      email: 'learner@example.com',
      displayName: 'Ada Lovelace',
      photoURL: 'https://example.com/avatar.png',
      getIdToken: jest.fn(() => Promise.resolve('firebase-id-token')),
    };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: jwtWithExp(Math.floor((Date.now() + 60 * 60_000) / 1000)),
        user: {
          email: 'learner@example.com',
          first_name: 'Ada',
          last_name: 'Lovelace',
          picture_url: 'https://example.com/avatar.png',
        },
      }),
    });

    await expect(restoreGoogleBackendSession()).resolves.toMatchObject({
      email: 'learner@example.com',
    });

    expect(auth.currentUser.getIdToken).toHaveBeenCalledWith(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/firebase-auth'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(localStorage.getItem('username')).toBe('learner@example.com');
    expect(hasUsableBackendSession()).toBe(true);
  });

  it('disables automatic restore and signs Firebase out on explicit logout', async () => {
    enableGoogleAutoSignIn();
    localStorage.setItem('token', 'backend-token');
    localStorage.setItem('username', 'learner@example.com');
    localStorage.setItem('userProfile', '{}');
    sessionStorage.setItem('justLoggedIn', 'true');

    await signOutAppSession();

    expect(localStorage.getItem(GOOGLE_AUTO_SIGN_IN_KEY)).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('username')).toBeNull();
    expect(localStorage.getItem('userProfile')).toBeNull();
    expect(sessionStorage.getItem('justLoggedIn')).toBeNull();
    expect(signOut).toHaveBeenCalledWith(auth);
  });
});

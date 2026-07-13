import { signOut } from 'firebase/auth';
import { auth } from '../../firebase/config';
import {
  canRestoreGoogleSession,
  enableGoogleAutoSignIn,
  getPersistedGoogleUser,
  GOOGLE_AUTO_SIGN_IN_KEY,
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

describe('Google auth session persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    auth.currentUser = null;
    auth.authStateReady.mockClear();
    signOut.mockResolvedValue(undefined);
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

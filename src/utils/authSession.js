import { signOut } from 'firebase/auth';
import { auth, authPersistenceReady } from '../firebase/config';
import { clearBackendSession } from './backendSession';

export const GOOGLE_AUTO_SIGN_IN_KEY = 'cerbyl.googleAutoSignIn';

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

export const signOutAppSession = async () => {
  localStorage.removeItem(GOOGLE_AUTO_SIGN_IN_KEY);
  clearBackendSession();

  await authPersistenceReady;
  await signOut(auth).catch(() => {});
};

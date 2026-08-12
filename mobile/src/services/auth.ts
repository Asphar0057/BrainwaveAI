import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, getMe, googleAuth } from './api';
import { getToken, setToken, removeToken } from './tokenStorage';

export type AuthUser = {
  id?: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  created_at?: string;
  google_user?: boolean;
};

export async function signIn(username: string, password: string): Promise<AuthUser> {
  const data = await apiLogin(username, password);
  await setToken(data.access_token);
  try {
    const me = await getMe();
    await AsyncStorage.setItem('user', JSON.stringify(me));
    return me;
  } catch (error) {
    await removeToken();
    await AsyncStorage.removeItem('user');
    throw error;
  }
}

export async function signOut() {
  await removeToken();
  await AsyncStorage.removeItem('user');
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export async function updateStoredUser(patch: Partial<AuthUser>): Promise<AuthUser> {
  const current = (await getStoredUser()) ?? ({} as AuthUser);
  const next = { ...current, ...patch };
  await AsyncStorage.setItem('user', JSON.stringify(next));
  return next;
}

export async function updateStoredToken(accessToken: string) {
  await setToken(accessToken);
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}

export async function signInWithGoogle(idToken: string): Promise<AuthUser> {
  const data = await googleAuth(idToken);
  await setToken(data.access_token);
  try {
    const me = await getMe();
    await AsyncStorage.setItem('user', JSON.stringify(me));
    return me;
  } catch (error) {
    await removeToken();
    await AsyncStorage.removeItem('user');
    throw error;
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, getMe, googleAuth } from './api';

export type AuthUser = {
  username: string;
  email: string;
  first_name?: string;
};

export async function signIn(username: string, password: string): Promise<AuthUser> {
  const data = await apiLogin(username, password);
  await AsyncStorage.setItem('token', data.access_token);
  try {
    const me = await getMe();
    await AsyncStorage.setItem('user', JSON.stringify(me));
    return me;
  } catch (error) {
    await AsyncStorage.multiRemove(['token', 'user']);
    throw error;
  }
}

export async function signOut() {
  await AsyncStorage.multiRemove(['token', 'user']);
}

export async function getStoredUser(): Promise<AuthUser | null> {
  const raw = await AsyncStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await AsyncStorage.getItem('token');
  return !!token;
}

export async function signInWithGoogle(idToken: string): Promise<AuthUser> {
  const data = await googleAuth(idToken);
  await AsyncStorage.setItem('token', data.access_token);
  try {
    const me = await getMe();
    await AsyncStorage.setItem('user', JSON.stringify(me));
    return me;
  } catch (error) {
    await AsyncStorage.multiRemove(['token', 'user']);
    throw error;
  }
}

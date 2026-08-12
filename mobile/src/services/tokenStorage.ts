import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'token';

// expo-secure-store wraps the iOS Keychain / Android Keystore (encrypted at
// rest, sandboxed per-app) instead of AsyncStorage's plaintext on-disk file --
// the auth JWT was previously readable by anything with filesystem access to
// the app's sandbox (a rooted/jailbroken device, a backup extraction tool).
// SecureStore has no web implementation, so the web build (react-native-web)
// falls back to AsyncStorage there, same as before.
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

export async function getToken(): Promise<string | null> {
  return isNative ? SecureStore.getItemAsync(TOKEN_KEY) : AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (isNative) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } else {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  }
}

export async function removeToken(): Promise<void> {
  if (isNative) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } else {
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
}

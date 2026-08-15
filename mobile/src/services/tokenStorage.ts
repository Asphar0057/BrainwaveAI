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
  if (!isNative) return AsyncStorage.getItem(TOKEN_KEY);

  const secureToken = await SecureStore.getItemAsync(TOKEN_KEY);
  if (secureToken) return secureToken;

  // One-time migration for users who signed in before tokens moved from
  // AsyncStorage to the native keychain. Without this, the cached user opens
  // the app but every authenticated API request is silently sent without a
  // bearer token.
  const legacyToken = await AsyncStorage.getItem(TOKEN_KEY);
  if (!legacyToken) return null;

  await SecureStore.setItemAsync(TOKEN_KEY, legacyToken);
  await AsyncStorage.removeItem(TOKEN_KEY);
  return legacyToken;
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

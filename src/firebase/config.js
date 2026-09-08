
import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

// Public lessons and password sign-in must not depend on optional Google configuration.
let app = null;
let configuredAuth = null;
if (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId) {
  try { app = initializeApp(firebaseConfig); configuredAuth = getAuth(app); }
  catch (_) { /* Google sign-in reports unavailable when invoked. */ }
}
export const auth = configuredAuth;
export const authPersistenceReady = auth ? setPersistence(auth, browserLocalPersistence).catch(() => {
  // Firebase still uses its platform default if local persistence is unavailable.
}) : Promise.resolve();
export const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({
  prompt: 'select_account'
});

let configuredAnalytics = null;
if (app && firebaseConfig.measurementId) {
  try { configuredAnalytics = getAnalytics(app); } catch (_) { /* Analytics is optional. */ }
}
export const analytics = configuredAnalytics;

export default app;

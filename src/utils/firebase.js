import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import webConfig from '../firebaseConfig.json' with { type: 'json' };

const env = import.meta.env || {};
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || webConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || webConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID || webConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || webConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || webConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID || webConfig.appId,
};
export const firebaseConfigured = typeof window !== 'undefined' && Object.values(config).every(Boolean);
const app = firebaseConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}) : null;
export const storage = app ? getStorage(app) : null;
export function requireUser(expectedUid) {
  const uid = auth?.currentUser?.uid;
  if (!uid || (expectedUid && uid !== expectedUid)) throw new Error('Please sign in again before saving.');
  return uid;
}

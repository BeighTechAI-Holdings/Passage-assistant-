import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/** Client Firebase config from env (Vercel + local .env). Do not commit secrets; set in Vercel Project → Environment Variables. */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
};

const firestoreDatabaseId =
  import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim() || '(default)';

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.warn(
    '[Firebase] Missing VITE_FIREBASE_* variables. Add them to .env locally or in Vercel → Settings → Environment Variables.'
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

export const signInWithDrive = async () => {
  console.log('[Firebase] Initiating signInWithPopup for Drive...');
  const result = await signInWithPopup(auth, googleProvider);
  console.log('[Firebase] signInWithPopup result received.');
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return {
    user: result.user,
    accessToken: credential?.accessToken,
  };
};

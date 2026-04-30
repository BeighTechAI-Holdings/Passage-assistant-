import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  type User,
} from 'firebase/auth';
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

/**
 * Firestore database ID. `firebase-applet-config.json` is gitignored locally — do not import it in the bundle
 * (Vercel builds would fail). Set `VITE_FIREBASE_FIRESTORE_DATABASE_ID` in Vercel, or rely on the default below.
 * Use "(default)" in env to target the default database instead of this named DB.
 */
const NAMED_FIRESTORE_DATABASE_ID = 'ai-studio-70149557-1599-445b-9e40-91b543c828af';
const envDbId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID?.trim().replace(/^["']|["']$/g, '') || '';
const firestoreDatabaseId =
  envDbId === '(default)' ? '' : envDbId || NAMED_FIRESTORE_DATABASE_ID;

export const isFirebaseConfigured = !!(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId
);

if (!isFirebaseConfigured) {
  console.warn(
    '[Firebase] Missing VITE_FIREBASE_* variables. Add them to .env locally or in Vercel → Settings → Environment Variables.'
  );
}

const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null;

function createAuth() {
  if (!app) return null;
  try {
    return initializeAuth(app, {
      persistence: browserLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/already-initialized') {
      return getAuth(app);
    }
    console.warn('[Firebase] initializeAuth failed; using getAuth', e);
    return getAuth(app);
  }
}

export const auth = createAuth();
export const db = app
  ? firestoreDatabaseId
    ? getFirestore(app, firestoreDatabaseId)
    : getFirestore(app)
  : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');

export const signInWithGoogle = () => {
  if (!auth) throw new Error('Firebase is not configured');
  return signInWithPopup(auth, googleProvider);
};

export const signInWithGoogleRedirect = () => {
  if (!auth) throw new Error('Firebase is not configured');
  return signInWithRedirect(auth, googleProvider);
};

export const signInWithDrive = async () => {
  if (!auth) throw new Error('Firebase is not configured');
  console.log('[Firebase] Initiating signInWithPopup for Drive...');
  const result = await signInWithPopup(auth, googleProvider);
  console.log('[Firebase] signInWithPopup result received.');
  const credential = GoogleAuthProvider.credentialFromResult(result);
  return {
    user: result.user,
    accessToken: credential?.accessToken,
  };
};

export const signInWithDriveRedirect = () => {
  if (!auth) throw new Error('Firebase is not configured');
  console.log('[Firebase] Initiating signInWithRedirect for Drive...');
  return signInWithRedirect(auth, googleProvider);
};

export type RedirectAuthPayload = {
  user: User;
  accessToken: string | undefined;
};

/**
 * `getRedirectResult` must run at most once per full page load; React StrictMode and
 * re-renders must share the same in-flight promise. Surfaces real errors instead of swallowing them.
 */
let redirectResultOnce: Promise<RedirectAuthPayload | null> | null = null;

export const getRedirectAuthResult = (): Promise<RedirectAuthPayload | null> => {
  if (!auth) return Promise.resolve(null);
  if (!redirectResultOnce) {
    redirectResultOnce = (async (): Promise<RedirectAuthPayload | null> => {
      try {
        await auth.authStateReady();
      } catch (e) {
        console.warn('[Firebase] authStateReady', e);
      }
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          const credential = GoogleAuthProvider.credentialFromResult(result);
          let accessToken = credential?.accessToken ?? undefined;
          if (!accessToken) {
            const tr = (result as { _tokenResponse?: { oauthAccessToken?: string } })?._tokenResponse;
            if (tr?.oauthAccessToken) accessToken = tr.oauthAccessToken;
          }
          return { user: result.user, accessToken };
        }
      } catch (e) {
        console.error('[Firebase] getRedirectResult failed', e);
      }
      const user = auth.currentUser;
      if (user) {
        return { user, accessToken: undefined };
      }
      return null;
    })();
  }
  return redirectResultOnce;
};

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { environment } from './environment';

const isDevelopment = import.meta.env.MODE === 'development';

// Log all environment variables and configuration
console.log('Full Environment Debug:', {
  mode: import.meta.env.MODE,
  isDev: isDevelopment,
  base: import.meta.env.BASE_URL,
  allEnvVars: {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID
  },
  window: {
    location: window.location.href,
    hostname: window.location.hostname,
    origin: window.location.origin
  }
});

// Log environment variables
console.log('Environment Variables:', {
  mode: import.meta.env.MODE,
  isDev: isDevelopment,
  config: environment
});

const firebaseConfig = {
  ...environment
};

// Log the final config being used
console.log('Firebase Config:', {
  authDomain: firebaseConfig.authDomain,
  mode: import.meta.env.MODE,
  isDev: isDevelopment
});

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, 'us-central1');

// Connect to emulators in development
if (isDevelopment) {
  console.log('Connecting to Firebase emulators...');
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
  connectStorageEmulator(storage, 'localhost', 9199);
}

export default app;

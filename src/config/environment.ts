const getEnvironment = () => {
  const mode = import.meta.env.MODE;
  const isDevelopment = mode === 'development';
  const hostname = window.location.hostname;

  // Determine auth domain from environment or fallback
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 
    (hostname === 'localhost' ? 'localhost:5173' : 'inglesabordo.com');

  if (isDevelopment) {
    console.log('[Environment] Using development configuration');
  }

  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  return config;
};

export const environment = getEnvironment(); 
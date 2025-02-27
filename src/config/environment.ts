const getEnvironment = () => {
  const mode = import.meta.env.MODE;
  const isDevelopment = mode === 'development';
  const hostname = window.location.hostname;

  const logEnv = (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[ENV] ${message}`, data ? data : '');
    }
  };

  // Log raw environment values
  logEnv('Raw Environment Values:', {
    mode,
    isDevelopment,
    hostname,
    envVars: {
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY?.slice(0, 5) + '...',
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID
    }
  });

  // Determine auth domain from environment or fallback
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 
    (hostname === 'localhost' ? 'localhost:5173' : 'app.inglesabordo.com');

  console.log('Auth Domain Resolution:', {
    fromEnv: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    hostname,
    finalAuthDomain: authDomain,
    timestamp: new Date().toISOString()
  });

  console.log('Environment Resolution:', {
    mode,
    isDevelopment,
    hostname,
    authDomain,
    baseUrl: window.location.origin,
    usingEnvVar: !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
  });

  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  if (isDevelopment) {
    console.log('Using development config:', config);
    return config;
  }

  // For production, use environment variables
  console.log('Using production config:', {
    ...config,
    usingEnvVars: {
      apiKey: !!import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: !!import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: !!import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: !!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: !!import.meta.env.VITE_FIREBASE_APP_ID
    }
  });

  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'ingles-a-bordo',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'ingles-a-bordo.firebasestorage.app',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1057881499048',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1057881499048:web:7871a9e01309afe427699d'
  };
};

export const environment = getEnvironment(); 
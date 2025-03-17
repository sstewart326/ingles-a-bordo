import { createContext, useEffect, useState } from 'react';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  UserCredential,
  browserLocalPersistence
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { useNavigate, useLocation } from 'react-router-dom';
import { updateCachedDocument, deleteCachedDocument, setCachedDocument } from '../utils/firebaseUtils';

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, token: string) => Promise<UserCredential>;
  loginWithGoogle: (signupData?: { token: string, validation: Record<string, unknown> }) => Promise<UserCredential | null>;
  logout: () => Promise<void>;
  loading: boolean;
  authError: string | null;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const logAuth = (category: string, message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUTH][${category}] ${message}`, data ? data : '');
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [redirectProcessed] = useState(false);
  const [isProcessingAuth, setIsProcessingAuth] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const clearAuthError = () => setAuthError(null);

  useEffect(() => {
    let mounted = true;
    logAuth('REDIRECT', '====== Auth Provider Mounted ======');

    // Set persistence to local first
    auth.setPersistence(browserLocalPersistence)
      .then(() => {
        logAuth('REDIRECT', 'Persistence set to local');
        
        // Only set up auth state listener after persistence is set
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (!mounted || isProcessingAuth) return;
          
          try {
            setIsProcessingAuth(true);
            logAuth('FLOW', 'Auth state changed:', { user: !!user });

            if (user && mounted) {
              logAuth('FLOW', 'User authenticated, checking path:', {
                path: location.pathname,
                email: user.email
              });

              // Check for pending signup data from Google sign-in
              const pendingToken = localStorage.getItem('pendingSignupToken');
              const pendingValidationStr = localStorage.getItem('pendingSignupValidation');
              
              if (pendingToken && pendingValidationStr) {
                try {
                  logAuth('FLOW', 'Found pending signup data, processing...');
                  const pendingValidation = JSON.parse(pendingValidationStr);
                  
                  // Verify the Google account email matches the invitation
                  if (user.email?.toLowerCase() !== pendingValidation.email.toLowerCase()) {
                    logAuth('FLOW', 'Email mismatch:', {
                      google: user.email,
                      invitation: pendingValidation.email
                    });
                    await signOut(auth);
                    navigate('/signup?token=' + pendingToken + '&error=email_mismatch');
                    return;
                  }

                  // Find the pending user document
                  const usersRef = collection(db, 'users');
                  const q = query(usersRef, where('email', '==', user.email), where('status', '==', 'pending'));
                  const querySnapshot = await getDocs(q);

                  if (querySnapshot.empty) {
                    logAuth('FLOW', 'No pending user found for email:', user.email);
                    await signOut(auth);
                    navigate('/signup?token=' + pendingToken + '&error=no_invitation');
                    return;
                  }

                  const pendingUserDoc = querySnapshot.docs[0];
                  const currentData = pendingUserDoc.data();

                  try {
                    // For admin users, create new document with auth UID and delete pending
                    if (currentData.isAdmin) {
                      const newUserData = {
                        uid: user.uid,
                        email: currentData.email,
                        name: currentData.name,
                        isAdmin: currentData.isAdmin,
                        status: 'active',
                        createdAt: currentData.createdAt,
                        updatedAt: new Date().toISOString()
                      };

                      logAuth('FLOW', 'Creating new admin document:', {
                        id: user.uid,
                        data: newUserData
                      });

                      // Create new document with auth UID
                      await setCachedDocument('users', user.uid, newUserData);
                      
                      // Delete the pending document
                      await deleteCachedDocument('users', pendingUserDoc.id);
                      
                      logAuth('FLOW', 'Admin user document created successfully');
                    } else {
                      // For non-admin users, update the pending document
                      const newUserData = {
                        uid: user.uid,
                        email: currentData.email,
                        name: currentData.name,
                        isAdmin: currentData.isAdmin,
                        status: 'active',
                        createdAt: currentData.createdAt,
                        updatedAt: new Date().toISOString()
                      };

                      logAuth('FLOW', 'Updating user document:', {
                        id: pendingUserDoc.id,
                        data: newUserData
                      });

                      // Update the pending document to active
                      await updateCachedDocument('users', pendingUserDoc.id, newUserData);
                      logAuth('FLOW', 'User document updated successfully');
                    }

                    // Mark the signup token as used
                    logAuth('FLOW', 'Marking signup token as used:', pendingToken);
                    await updateDoc(doc(db, 'signupTokens', pendingToken), {
                      used: true,
                      updatedAt: new Date().toISOString()
                    });
                    logAuth('FLOW', 'Signup token marked as used');

                    // Clear the pending signup data
                    localStorage.removeItem('pendingSignupToken');
                    localStorage.removeItem('pendingSignupValidation');

                    // Navigate to dashboard
                    navigate('/dashboard');
                    return;
                  } catch (error) {
                    logAuth('FLOW', 'Error updating user document:', error);
                    await signOut(auth);
                    navigate('/signup?token=' + pendingToken + '&error=signup_failed');
                    return;
                  }
                } catch (error) {
                  logAuth('FLOW', 'Error processing signup:', error);
                  await signOut(auth);
                  navigate('/signup?token=' + pendingToken + '&error=auth_failed');
                  return;
                }
              }
              
              if ((location.pathname === '/login' || location.pathname === '/') && !redirectProcessed) {
                logAuth('FLOW', 'On login page, checking user status');
                const usersRef = collection(db, 'users');
                const q = query(
                  usersRef,
                  where('email', '==', user.email),
                  where('status', '==', 'active')
                );
                
                try {
                  const querySnapshot = await getDocs(q);
                  logAuth('FLOW', 'User status check result:', {
                    empty: querySnapshot.empty,
                    email: user.email,
                    timestamp: new Date().toISOString()
                  });

                  if (querySnapshot.empty && mounted) {
                    logAuth('FLOW', 'No active user found, signing out');
                    await signOut(auth);
                    navigate('/signup');
                  } else if (mounted) {
                    logAuth('FLOW', 'Active user found, navigating to dashboard');
                    setCurrentUser(user);
                    navigate('/dashboard');
                  }
                } catch (error) {
                  logAuth('FLOW', 'Error checking user status:', error);
                }
              } else if (mounted) {
                logAuth('FLOW', 'Setting current user on non-login page');
                setCurrentUser(user);
              }
            } else if (mounted) {
              logAuth('FLOW', 'No user, clearing current user');
              setCurrentUser(null);
            }
          } finally {
            if (mounted) {
              setIsProcessingAuth(false);
              setLoading(false);
            }
          }
        });

        return () => {
          mounted = false;
          unsubscribe();
        };
      })
      .catch((error) => {
        logAuth('REDIRECT', 'Failed to set persistence:', {
          error,
          code: error.code,
          message: error.message,
          timestamp: new Date().toISOString()
        });
        if (mounted) {
          setLoading(false);
        }
      });
  }, [navigate, location.pathname, isProcessingAuth, redirectProcessed]);

  const signup = async (email: string, password: string, token: string) => {
    try {
      setLoading(true);
      logAuth('FLOW', 'Starting signup process...');
      
      // Create the authentication user first to get the UID
      logAuth('FLOW', 'Creating Firebase Auth user...');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      logAuth('FLOW', 'Firebase Auth user created:', user.uid);

      // Now that we're authenticated, find the pending user document
      logAuth('FLOW', 'Finding pending user document...');
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', email), where('status', '==', 'pending'));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        logAuth('FLOW', 'No pending user found for email:', email);
        // If no pending user found, delete the auth user we just created
        await user.delete();
        throw new Error('No pending user found');
      }

      const pendingUserDoc = querySnapshot.docs[0];
      const currentData = pendingUserDoc.data();
      
      logAuth('FLOW', 'Found pending user:', {
        id: pendingUserDoc.id,
        data: currentData
      });

      try {
        // For admin users, create new document with auth UID and delete pending
        if (currentData.isAdmin) {
          // Create new document with auth UID
          const newUserData = {
            uid: user.uid,
            email: currentData.email,
            name: currentData.name,
            isAdmin: currentData.isAdmin,
            status: 'active',
            createdAt: currentData.createdAt,
            updatedAt: new Date().toISOString()
          };

          logAuth('FLOW', 'Creating new admin document:', {
            id: user.uid,
            data: newUserData
          });

          // Create new document with auth UID
          await setCachedDocument('users', user.uid, newUserData);
          
          // Delete the pending document
          await deleteCachedDocument('users', pendingUserDoc.id);
          
          logAuth('FLOW', 'Admin user document created successfully');
        } else {
          // For non-admin users, update the pending document
          const newUserData = {
            uid: user.uid,
            email: currentData.email,
            name: currentData.name,
            isAdmin: currentData.isAdmin,
            status: 'active',
            createdAt: currentData.createdAt,
            updatedAt: new Date().toISOString()
          };

          logAuth('FLOW', 'Updating user document:', {
            id: pendingUserDoc.id,
            data: newUserData
          });

          // Update the pending document to active
          await updateCachedDocument('users', pendingUserDoc.id, newUserData);
          logAuth('FLOW', 'User document updated successfully');
        }

        // Mark the signup token as used
        logAuth('FLOW', 'Marking signup token as used:', token);
        await updateDoc(doc(db, 'signupTokens', token), {
          used: true,
          updatedAt: new Date().toISOString()
        });
        logAuth('FLOW', 'Signup token marked as used');

        logAuth('FLOW', 'Signup process completed successfully');
        return userCredential;
      } catch (error) {
        // If anything fails after creating the auth user, delete it
        logAuth('FLOW', 'Error updating user document:', error);
        await user.delete();
        if (error instanceof Error) {
          logAuth('FLOW', 'Document update error details:', {
            message: error.message,
            name: error.name,
          });
        }
        throw error;
      }
    } catch (error) {
      logAuth('FLOW', 'Error in signup process:', error);
      if (error instanceof Error) {
        logAuth('FLOW', 'Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      throw error;
    }
  };

  const loginWithGoogle = async (signupData?: { token: string, validation: Record<string, unknown> }) => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('email');
      provider.addScope('profile');
      
      // Force account selection
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (signupData) {
        localStorage.setItem('pendingSignupToken', signupData.token);
        localStorage.setItem('pendingSignupValidation', JSON.stringify(signupData.validation));
      }

      if (isMobile) {
        await signInWithRedirect(auth, provider);
        return null;
      } else {
        const result = await signInWithPopup(auth, provider);
        return result;
      }
    } catch (error) {
      logAuth('ERROR', 'Google login error:', error);
      localStorage.removeItem('pendingSignupToken');
      localStorage.removeItem('pendingSignupValidation');
      throw error;
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Check user status immediately after successful login
      const usersRef = collection(db, 'users');
      const q = query(
        usersRef,
        where('email', '==', userCredential.user.email),
        where('status', '==', 'active')
      );
      
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        await signOut(auth);
        throw new Error('No active user found');
      } else {
        setCurrentUser(userCredential.user);
        navigate('/dashboard');
      }
    } catch (error) {
      logAuth('ERROR', 'Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    // Clear masquerade state from session storage
    sessionStorage.removeItem('masqueradeUser');
    await signOut(auth);
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    login,
    signup,
    loginWithGoogle,
    logout,
    loading,
    authError,
    clearAuthError
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 
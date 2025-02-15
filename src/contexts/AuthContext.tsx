import { createContext, useEffect, useState } from 'react';
import { 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  UserCredential
} from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, token: string) => Promise<UserCredential>;
  loginWithGoogle: () => Promise<UserCredential>;
  logout: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signup = async (email: string, password: string, name: string, token: string) => {
    console.log('Starting signup process...');
    
    // Find the pending user document first
    console.log('Finding pending user document...');
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email), where('status', '==', 'pending'));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.error('No pending user found for email:', email);
      throw new Error('No pending user found');
    }

    const pendingUserDoc = querySnapshot.docs[0];
    const currentData = pendingUserDoc.data();
    
    console.log('Found pending user:', {
      id: pendingUserDoc.id,
      data: currentData
    });

    try {
      // Create the authentication user
      console.log('Creating Firebase Auth user...');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('Firebase Auth user created:', user.uid);

      // Create new active user document
      const newUserData = {
        email: currentData.email,
        name: currentData.name,
        isAdmin: currentData.isAdmin,
        status: 'active',
        uid: user.uid,
        createdAt: currentData.createdAt,
        updatedAt: new Date().toISOString()
      };

      console.log('Creating new user document:', {
        id: user.uid,
        data: newUserData,
        currentData: currentData,
        pendingDocId: pendingUserDoc.id
      });

      try {
        // Update the pending document to active
        console.log('Attempting to update user document to active...');
        await updateDoc(doc(db, 'users', pendingUserDoc.id), newUserData);
        console.log('User document updated successfully');
      } catch (error) {
        console.error('Error updating user document:', error);
        if (error instanceof Error) {
          console.error('Document update error details:', {
            message: error.message,
            name: error.name,
            stack: error.stack
          });
        }
        throw error;
      }

      // Mark the signup token as used
      console.log('Marking signup token as used:', token);
      await updateDoc(doc(db, 'signupTokens', token), {
        used: true,
        updatedAt: new Date().toISOString()
      });
      console.log('Signup token marked as used');

      console.log('Signup process completed successfully');
      return userCredential;
    } catch (error) {
      console.error('Error in signup process:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      throw error;
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    return userCredential;
  };

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value = {
    currentUser,
    login,
    signup,
    loginWithGoogle,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext; 
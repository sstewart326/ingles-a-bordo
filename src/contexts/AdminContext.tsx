import { createContext, useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

interface AdminContextType {
  isAdmin: boolean;
  loading: boolean;
}

const AdminContext = createContext<AdminContextType | null>(null);

// Add structured logging
const logAdmin = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[ADMIN] ${message}`, data ? data : '');
  }
};

export const AdminProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(() => {
    // Try to get from sessionStorage first
    const stored = sessionStorage.getItem('isAdmin');
    logAdmin('Initial admin state from storage:', stored);
    return stored === 'true';
  });
  const [loading, setLoading] = useState(true);
  const { currentUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!currentUser) {
      logAdmin('No current user, setting isAdmin to false');
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    logAdmin('Setting up admin status listener for user:', {
      uid: currentUser.uid,
      email: currentUser.email
    });

    // First try to find the user document by uid
    const findUserDocument = async () => {
      try {
        // Try by UID first
        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubscribe = onSnapshot(userDocRef, (doc) => {
          logAdmin('User document snapshot by UID:', {
            exists: doc.exists(),
            data: doc.data()
          });

          if (doc.exists()) {
            const userData = doc.data();
            const isAdminUser = userData?.isAdmin === true;
            logAdmin('Setting admin status from UID document:', isAdminUser);
            setIsAdmin(isAdminUser);
            sessionStorage.setItem('isAdmin', isAdminUser.toString());
            setLoading(false);
            return;
          }

          // If no document found by UID, try by email
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', currentUser.email));
          
          getDocs(q).then((querySnapshot) => {
            logAdmin('User document query by email:', {
              empty: querySnapshot.empty,
              size: querySnapshot.size
            });

            if (!querySnapshot.empty) {
              const userDoc = querySnapshot.docs[0];
              const userData = userDoc.data();
              const isAdminUser = userData?.isAdmin === true;
              logAdmin('Setting admin status from email document:', {
                docId: userDoc.id,
                isAdmin: isAdminUser,
                userData
              });
              setIsAdmin(isAdminUser);
              sessionStorage.setItem('isAdmin', isAdminUser.toString());
            } else {
              logAdmin('No user document found by email');
              setIsAdmin(false);
              sessionStorage.setItem('isAdmin', 'false');
            }
            setLoading(false);
          });
        });

        return unsubscribe;
      } catch (error) {
        logAdmin('Error in admin status listener:', error);
        setIsAdmin(false);
        sessionStorage.setItem('isAdmin', 'false');
        setLoading(false);
        return () => {};
      }
    };

    const unsubscribePromise = findUserDocument();
    return () => {
      unsubscribePromise.then(unsubscribe => unsubscribe());
    };
  }, [currentUser]);

  return (
    <AdminContext.Provider value={{ isAdmin, loading: loading || authLoading }}>
      {children}
    </AdminContext.Provider>
  );
};

export default AdminContext; 
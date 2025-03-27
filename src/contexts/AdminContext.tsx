import { createContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';
import { logQuery } from '../utils/firebaseUtils';

interface AdminContextType {
  isAdmin: boolean;
  loading: boolean;
}

export const AdminContext = createContext<AdminContextType>({
  isAdmin: false,
  loading: true,
});

export const AdminProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    // Set up real-time listener for admin status
    const userDocRef = doc(db, 'users', currentUser.uid);
    logQuery('Setting up admin status listener', { uid: currentUser.uid });
    
    const unsubscribe = onSnapshot(userDocRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        const isAdminUser = userData?.isAdmin === true;
        logQuery('Admin status updated', { isAdmin: isAdminUser });
        setIsAdmin(isAdminUser);
      } else {
        logQuery('No user document found');
        setIsAdmin(false);
      }
      setLoading(false);
    }, (error) => {
      logQuery('Error in admin status listener', error);
      setIsAdmin(false);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return (
    <AdminContext.Provider value={{ isAdmin, loading }}>
      {children}
    </AdminContext.Provider>
  );
}; 
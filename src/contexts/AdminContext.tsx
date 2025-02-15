import { createContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

interface AdminContextType {
  isAdmin: boolean;
  loading: boolean;
}

const AdminContext = createContext<AdminContextType | null>(null);

export const AdminProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(() => {
    // Try to get from sessionStorage first
    const stored = sessionStorage.getItem('isAdmin');
    return stored === 'true';
  });
  const [loading, setLoading] = useState(true);
  const { currentUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!currentUser) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', currentUser.uid), (doc) => {
      const userData = doc.data();
      const isAdminUser = userData?.isAdmin === true;  // Explicitly check for boolean true
      setIsAdmin(isAdminUser);
      
      // Cache the admin status
      sessionStorage.setItem('isAdmin', isAdminUser.toString());
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  return (
    <AdminContext.Provider value={{ isAdmin, loading: loading || authLoading }}>
      {children}
    </AdminContext.Provider>
  );
};

export default AdminContext; 
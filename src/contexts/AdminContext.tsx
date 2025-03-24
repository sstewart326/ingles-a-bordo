import { createContext, useState, useEffect } from 'react';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

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

    // Check session storage first
    const cachedIsAdmin = sessionStorage.getItem('isAdmin');
    if (cachedIsAdmin !== null) {
      setIsAdmin(cachedIsAdmin === 'true');
      setLoading(false);
      return;
    }

    const checkAdminStatus = async () => {
      try {
        // Try by UID first
        const userDocRef = doc(db, 'users', currentUser.uid);
        const unsubscribe = onSnapshot(userDocRef, (doc) => {

          if (doc.exists()) {
            const userData = doc.data();
            const isAdminUser = userData?.isAdmin === true;
            setIsAdmin(isAdminUser);
            sessionStorage.setItem('isAdmin', isAdminUser.toString());
            setLoading(false);
            return;
          }

          // If no document found by UID, try by email
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('email', '==', currentUser.email));
          
          getDocs(q).then((querySnapshot) => {

            if (!querySnapshot.empty) {
              const userDoc = querySnapshot.docs[0];
              const userData = userDoc.data();
              const isAdminUser = userData?.isAdmin === true;
              setIsAdmin(isAdminUser);
              sessionStorage.setItem('isAdmin', isAdminUser.toString());
            } else {
              setIsAdmin(false);
              sessionStorage.setItem('isAdmin', 'false');
            }
            setLoading(false);
          });
        });

        return unsubscribe;
      } catch (error) {
        setIsAdmin(false);
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [currentUser]);

  return (
    <AdminContext.Provider value={{ isAdmin, loading }}>
      {children}
    </AdminContext.Provider>
  );
}; 
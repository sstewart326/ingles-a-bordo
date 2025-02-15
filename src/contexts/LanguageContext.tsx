import { createContext, useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export type Language = 'en' | 'pt-BR';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useAuth();
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const fetchLanguagePreference = async () => {
      if (!currentUser) {
        setLanguageState('en');
        return;
      }

      try {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('uid', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          if (userDoc.data().language) {
            setLanguageState(userDoc.data().language as Language);
          }
        }
      } catch (error) {
        console.error('Error fetching language preference:', error);
      }
    };

    fetchLanguagePreference();
  }, [currentUser]);

  const setLanguage = async (newLanguage: Language) => {
    if (!currentUser) return;

    try {
      console.log('Language update - Current user:', currentUser.uid);
      console.log('Language update - New language:', newLanguage);

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('uid', '==', currentUser.uid));
      console.log('Language update - Querying for user document');
      
      const querySnapshot = await getDocs(q);
      console.log('Language update - Query results:', {
        empty: querySnapshot.empty,
        size: querySnapshot.size
      });
      
      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        console.log('Language update - Found user document:', userDoc.id);
        
        try {
          console.log('Language update - Attempting to update document');
          await updateDoc(doc(db, 'users', userDoc.id), {
            language: newLanguage
          });
          console.log('Language update - Document updated successfully');
          setLanguageState(newLanguage);
        } catch (docError) {
          console.error('Language update - Document update error:', docError);
          if (docError instanceof Error) {
            console.error('Language update - Error details:', {
              message: docError.message,
              name: docError.name,
              stack: docError.stack
            });
          }
          throw docError;
        }
      } else {
        console.error('Language update - No user document found');
        throw new Error('User document not found');
      }
    } catch (error) {
      console.error('Language update - Error:', error);
      if (error instanceof Error) {
        console.error('Language update - Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      throw error;
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext; 
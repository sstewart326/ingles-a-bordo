import { createContext, useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getCachedDocument } from '../utils/firebaseUtils';

interface UserProfile {
  id: string;
  name?: string;
  email: string;
  language?: Language;
  status: string;
  isAdmin: boolean;
  updatedAt: string;
}

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
    const fetchUserLanguage = async () => {
      if (!currentUser) return;

      try {
        const userDoc = await getCachedDocument<UserProfile>('users', currentUser.uid, { userId: currentUser.uid });
        
        if (userDoc?.language) {
          setLanguageState(userDoc.language);
        }
      } catch (error) {
        console.error('Error fetching user language:', error);
      }
    };

    fetchUserLanguage();
  }, [currentUser]);

  const setLanguage = async (newLanguage: Language) => {
    if (!currentUser) return;

    console.log('Language update - Current user:', currentUser.uid);
    
    try {
      // Only update the state, document updates are handled by the Profile component
      setLanguageState(newLanguage);
    } catch (error) {
      console.error('Error updating language state:', error);
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export default LanguageContext; 
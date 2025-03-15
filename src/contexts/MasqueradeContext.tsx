import { createContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getCachedDocument } from '../utils/firebaseUtils';

interface MasqueradeContextType {
  isMasquerading: boolean;
  masqueradingAs: MasqueradeUser | null;
  startMasquerade: (userId: string) => Promise<void>;
  stopMasquerade: () => void;
}

interface MasqueradeUser {
  id: string;
  uid?: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isTeacher?: boolean;
}

const MasqueradeContext = createContext<MasqueradeContextType | undefined>(undefined);

export const MasqueradeProvider = ({ children }: { children: ReactNode }) => {
  const { currentUser } = useAuth();
  const [isMasquerading, setIsMasquerading] = useState(false);
  const [masqueradingAs, setMasqueradingAs] = useState<MasqueradeUser | null>(null);

  // Restore masquerade state from session storage on mount
  useEffect(() => {
    const storedMasqueradeUser = sessionStorage.getItem('masqueradeUser');
    if (storedMasqueradeUser) {
      try {
        const parsedUser = JSON.parse(storedMasqueradeUser);
        setMasqueradingAs(parsedUser);
        setIsMasquerading(true);
      } catch (error) {
        console.error('Error parsing masquerade user from session storage:', error);
        sessionStorage.removeItem('masqueradeUser');
      }
    }
  }, []);

  const startMasquerade = async (userId: string) => {
    try {
      // Fetch the user document
      const userDoc = await getCachedDocument<MasqueradeUser>('users', userId);
      
      if (!userDoc) {
        throw new Error('User not found');
      }
      
      // Store in state and session storage
      setMasqueradingAs(userDoc);
      setIsMasquerading(true);
      sessionStorage.setItem('masqueradeUser', JSON.stringify(userDoc));
    } catch (error) {
      console.error('Error starting masquerade:', error);
      throw error;
    }
  };

  const stopMasquerade = () => {
    setIsMasquerading(false);
    setMasqueradingAs(null);
    sessionStorage.removeItem('masqueradeUser');
  };

  return (
    <MasqueradeContext.Provider
      value={{
        isMasquerading,
        masqueradingAs,
        startMasquerade,
        stopMasquerade
      }}
    >
      {children}
    </MasqueradeContext.Provider>
  );
};

export default MasqueradeContext; 
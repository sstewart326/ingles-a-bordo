import { useAuth } from './useAuth';
import { useMasquerade } from './useMasquerade';

export const useAuthWithMasquerade = () => {
  const auth = useAuth();
  const { isMasquerading, masqueradingAs } = useMasquerade();

  // If not authenticated, don't apply masquerade
  if (!auth.currentUser) {
    return {
      ...auth,
      isMasquerading: false,
      masqueradingAs: null
    };
  }

  // If masquerading, override the currentUser with masqueraded user data
  if (isMasquerading && masqueradingAs) {
    // Create a proxy object that mimics the Firebase User object
    // but with the masqueraded user's data
    const masqueradeUser = {
      ...auth.currentUser,
      // Override properties that should reflect the masqueraded user
      uid: masqueradingAs.uid || masqueradingAs.id,
      email: masqueradingAs.email,
      displayName: masqueradingAs.name,
      // Add a flag to indicate this is a masquerade user
      isMasqueradeUser: true
    };

    return {
      ...auth,
      currentUser: masqueradeUser,
      // Add masquerade info to the auth context
      isMasquerading,
      masqueradingAs
    };
  }

  // If not masquerading, return the original auth context
  return {
    ...auth,
    isMasquerading: false,
    masqueradingAs: null
  };
}; 
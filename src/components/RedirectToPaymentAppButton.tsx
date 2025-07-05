import React, { useContext } from 'react';
import { getAuth } from 'firebase/auth';
import { useTranslation } from '../translations';
import LanguageContext from '../contexts/LanguageContext';
import { getFunctionBaseUrl, getIdToken } from '../utils/firebaseUtils';

export const RedirectToPaymentAppButton: React.FC = () => {
  const languageContext = useContext(LanguageContext);
  const language = languageContext?.language || 'en';
  const t = useTranslation(language);

  const handleRedirect = async () => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      alert(t.pleaseLogin || 'You must be logged in to continue.');
      return;
    }

    try {
      // Get the current user's ID token using common utility
      const idToken = await getIdToken();
      
      // Make HTTP request to the Cloud Function using common base URL
      const baseUrl = getFunctionBaseUrl();
      const response = await fetch(`${baseUrl}/exchangeTokenForPayment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const { customToken } = result;

      // Redirect to payment app with token as URL parameter
      // The payment app can extract the token from the URL
      const redirectUrl = `https://pay.inglesabordo.com/receive-token?token=${encodeURIComponent(customToken)}`;
      window.location.href = redirectUrl;
    } catch (error) {
      alert(t.error || 'An error occurred. Please try again.');
      console.error('Token exchange failed:', error);
    }
  };

  return (
    <button 
      onClick={handleRedirect}
      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
    >
      {t.goToPaymentApp || 'Go to Payment Portal'}
    </button>
  );
}; 
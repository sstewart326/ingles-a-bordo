import { db } from '../config/firebase';
import { doc, setDoc, collection, query, where, getDocs, getDoc, updateDoc } from 'firebase/firestore';

export interface SignupTokenPayload {
  token: string;
  email: string;
  name: string;
  expiresAt: string;
}

interface ValidationResult {
  valid: boolean;
  email?: string;
  name?: string;
  token?: string;
}

// Generate a random token
const generateToken = () => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

// Create a signup link for a student
export const createSignupLink = async (studentEmail: string, studentName: string): Promise<string> => {
  // Check for existing valid tokens first
  const tokensRef = collection(db, 'signupTokens');
  const q = query(tokensRef, where('email', '==', studentEmail));
  const existingTokens = await getDocs(q);
  
  // Try to find a valid existing token
  const now = new Date();
  for (const doc of existingTokens.docs) {
    const data = doc.data();
    if (!data.used && new Date(data.expiresAt) > now) {
      // Found a valid token, reuse it
      return `${window.location.origin}/signup?token=${doc.id}`;
    }
  }

  // If no valid token exists, create a new one
  const token = generateToken();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await setDoc(doc(db, 'signupTokens', token), {
    token,
    email: studentEmail,
    name: studentName,
    expiresAt: expiresAt.toISOString(),
    used: false,
  });

  return `${window.location.origin}/signup?token=${token}`;
};

// Validate a signup token
export const validateSignupToken = async (token?: string): Promise<ValidationResult> => {
  if (!token) {
    console.log('No token provided for validation');
    return { valid: false };
  }

  try {
    const tokenDoc = await getDoc(doc(db, 'signupTokens', token));
    console.log('Token document exists:', tokenDoc.exists());
    
    if (!tokenDoc.exists()) {
      console.log('Token document does not exist');
      return { valid: false };
    }
    
    const data = tokenDoc.data();
    console.log('Token document data:', data);
    
    if (data.used) {
      console.log('Token is already used');
      return { valid: false };
    }

    const now = new Date();
    const tokenExpiry = new Date(data.expiresAt);
    console.log('Token expiry check:', {
      now: now.toISOString(),
      expiresAt: data.expiresAt,
      isExpired: tokenExpiry < now
    });
    
    if (tokenExpiry < now) {
      console.log('Token has expired');
      return { valid: false };
    }

    return { 
      valid: true, 
      email: data.email, 
      name: data.name, 
      token 
    };
  } catch (error) {
    console.error('Error in validateSignupToken:', error);
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
    }
    return { valid: false };
  }
};

// Consume a signup token (mark it as used)
export const consumeSignupToken = async (token: string) => {
  const tokenRef = doc(db, 'signupTokens', token);
  await updateDoc(tokenRef, {
    used: true
  });
}; 
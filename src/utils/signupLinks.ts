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
export const createSignupLink = async (studentEmail: string, studentName: string): Promise<{ signupLink: string, token: string }> => {
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
      return {
        signupLink: `${window.location.origin}/signup?token=${doc.id}`,
        token: doc.id
      };
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

  return {
    signupLink: `${window.location.origin}/signup?token=${token}`,
    token
  };
};

// Validate a signup token
export const validateSignupToken = async (token?: string): Promise<ValidationResult> => {
  if (!token) {
    return { valid: false };
  }

  try {
    const tokenDoc = await getDoc(doc(db, 'signupTokens', token));
    
    if (!tokenDoc.exists()) {
      return { valid: false };
    }
    
    const data = tokenDoc.data();
    
    if (data.used) {
      return { valid: false };
    }

    const now = new Date();
    const tokenExpiry = new Date(data.expiresAt);
    
    if (tokenExpiry < now) {
      return { valid: false };
    }

    return { 
      valid: true, 
      email: data.email, 
      name: data.name, 
      token 
    };
  } catch (error) {
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

// Extend the expiration date of a signup token
export const extendSignupTokenExpiration = async (token: string): Promise<void> => {
  const tokenRef = doc(db, 'signupTokens', token);
  const tokenDoc = await getDoc(tokenRef);
  
  if (!tokenDoc.exists()) {
    throw new Error('Token not found');
  }
  
  const data = tokenDoc.data();
  
  if (data.used) {
    throw new Error('Token already used');
  }
  
  // Set new expiration date to 24 hours from now
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  
  await updateDoc(tokenRef, {
    expiresAt: expiresAt.toISOString()
  });
}; 
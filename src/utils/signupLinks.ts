import { db } from '../config/firebase';
import { doc, setDoc, collection, query, where, getDocs, getDoc, updateDoc } from 'firebase/firestore';
import { logQuery } from './firebaseUtils';

export interface SignupTokenPayload {
  token: string;
  email: string;
  name: string;
  expiresAt: string;
}

export interface ValidationResult {
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
  logQuery('Querying signup tokens', { studentEmail });
  const q = query(tokensRef, where('email', '==', studentEmail));
  const existingTokens = await getDocs(q);
  logQuery('Signup Tokens Query result', { studentEmail, size: existingTokens.docs.length });
  
  // Try to find a valid existing token
  const now = new Date();
  for (const doc of existingTokens.docs) {
    const data = doc.data();
    if (!data.used && new Date(data.expiresAt) > now) {
      logQuery('Found valid existing token', { token: doc.id });
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

  logQuery('Creating new signup token', { token, studentEmail });
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
    logQuery('Validating signup token', { token });
    const tokenDoc = await getDoc(doc(db, 'signupTokens', token));
    logQuery('Token validation result', { token, exists: tokenDoc.exists() });
    
    if (!tokenDoc.exists()) {
      return { valid: false };
    }
    
    const data = tokenDoc.data();
    
    if (data.used) {
      logQuery('Token already used', { token });
      return { valid: false };
    }

    const now = new Date();
    const tokenExpiry = new Date(data.expiresAt);
    
    if (tokenExpiry < now) {
      logQuery('Token expired', { token, expiry: data.expiresAt });
      return { valid: false };
    }

    return { 
      valid: true, 
      email: data.email, 
      name: data.name, 
      token 
    };
  } catch (error) {
    logQuery('Token validation error', error);
    return { valid: false };
  }
};

// Extend the expiration date of a signup token
export const extendSignupTokenExpiration = async (token: string): Promise<void> => {
  logQuery('Extending signup token expiration', { token });
  const tokenRef = doc(db, 'signupTokens', token);
  const tokenDoc = await getDoc(tokenRef);
  
  if (!tokenDoc.exists()) {
    logQuery('Token not found', { token });
    throw new Error('Token not found');
  }
  
  const data = tokenDoc.data();
  
  if (data.used) {
    logQuery('Cannot extend used token', { token });
    throw new Error('Token already used');
  }
  
  // Set new expiration date to 24 hours from now
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  
  await updateDoc(tokenRef, {
    expiresAt: expiresAt.toISOString()
  });
}; 
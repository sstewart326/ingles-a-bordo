import { getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { getCachedCollection } from '../utils/firebaseUtils';
import { where } from 'firebase/firestore';

// Cache implementation
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

class CalendarCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds

  private createKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');
    
    return `${endpoint}?${sortedParams}`;
  }

  get(endpoint: string, params: Record<string, any>): any | null {
    const key = this.createKey(endpoint, params);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    // Check if cache has expired
    if (Date.now() - entry.timestamp > entry.expiresIn) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(endpoint: string, params: Record<string, any>, data: any, expiresIn: number = this.DEFAULT_EXPIRY): void {
    const key = this.createKey(endpoint, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      expiresIn
    });
  }

  invalidate(): void {
    this.cache.clear();
  }
}

const calendarCache = new CalendarCache();

// Helper function to get the base URL for Firebase Functions
const getFunctionBaseUrl = () => {
  const functions = getFunctions();
  const isDevelopment = import.meta.env.MODE === 'development';
  
  return isDevelopment
    ? `http://localhost:5001/${functions.app.options.projectId}/${functions.region}`
    : `${functions.customDomain || `https://${functions.region}-${functions.app.options.projectId}.cloudfunctions.net`}`;
};

// Helper function to get the current user's ID token
const getIdToken = async (): Promise<string> => {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('No authenticated user');
  }
  
  return user.getIdToken();
};

/**
 * Fetches calendar data for a specific month and year for the current user
 */
export const getCalendarData = async (month: number, year: number): Promise<any> => {
  try {
    // Check cache first
    const cachedData = calendarCache.get('getCalendarDataHttp', { month, year });
    if (cachedData) {
      return cachedData;
    }
    
    const baseUrl = getFunctionBaseUrl();
    const idToken = await getIdToken();
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('No authenticated user');
    }

    // Get the user's document ID from Firestore
    const userDocs = await getCachedCollection('users', [
      where('email', '==', user.email)
    ], {
      includeIds: true
    });

    const userDoc = userDocs[0];
    if (!userDoc) {
      throw new Error('User not found');
    }
    
    const url = `${baseUrl}/getCalendarDataHttp?month=${month}&year=${year}&userId=${userDoc.id}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch calendar data');
    }
    
    const data = await response.json();
    
    // Store in cache
    calendarCache.set('getCalendarDataHttp', { month, year }, data);
    
    return data;
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    throw error;
  }
};

/**
 * Fetches all classes for a specific month and year for admin users
 */
export const getAllClassesForMonth = async (month: number, year: number, options: { bypassCache?: boolean } = {}): Promise<any> => {
  try {
    // Check cache first if not bypassing
    if (!options.bypassCache) {
      const cachedData = calendarCache.get('getAllClassesForMonthHttp', { month, year });
      if (cachedData) {
        return cachedData;
      }
    }
    
    const baseUrl = getFunctionBaseUrl();
    const idToken = await getIdToken();
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('No authenticated user');
    }
    
    const url = `${baseUrl}/getAllClassesForMonthHttp?month=${month}&year=${year}&adminId=${user.uid}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch all classes for month');
    }
    
    const data = await response.json();
    
    // Store in cache if not bypassing
    if (!options.bypassCache) {
      calendarCache.set('getAllClassesForMonthHttp', { month, year }, data);
    }
    
    return data;
  } catch (error) {
    console.error('Error fetching all classes for month:', error);
    throw error;
  }
}; 
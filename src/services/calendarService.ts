import { getAuth } from 'firebase/auth';
import { getCachedCollection } from '../utils/firebaseUtils';
import { where } from 'firebase/firestore';
import { getFunctionBaseUrl, getIdToken } from '../utils/firebaseUtils';

// Cache implementation
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

class CalendarCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private readonly DEFAULT_EXPIRY = 5 * 60 * 1000; // 5 minutes in milliseconds
  // Track in-flight requests to prevent duplicates
  private inFlightRequests: Map<string, Promise<any>> = new Map();

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

  // Get an in-flight request if one exists
  getInFlightRequest(endpoint: string, params: Record<string, any>): Promise<any> | null {
    const key = this.createKey(endpoint, params);
    return this.inFlightRequests.get(key) || null;
  }

  // Set an in-flight request
  setInFlightRequest(endpoint: string, params: Record<string, any>, promise: Promise<any>): void {
    const key = this.createKey(endpoint, params);
    this.inFlightRequests.set(key, promise);
    
    // Clean up the in-flight request when it completes
    promise.finally(() => {
      if (this.inFlightRequests.get(key) === promise) {
        this.inFlightRequests.delete(key);
      }
    });
  }

  invalidate(): void {
    this.cache.clear();
    // We don't clear in-flight requests as they should be allowed to complete
  }
  
  // Invalidate specific cache entries
  invalidateByEndpoint(endpoint: string, params?: Record<string, any>): void {
    if (params) {
      // Invalidate specific endpoint + params
      const key = this.createKey(endpoint, params);
      this.cache.delete(key);
    } else {
      // Invalidate all entries for this endpoint
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${endpoint}?`)) {
          this.cache.delete(key);
        }
      }
    }
  }
}

const calendarCache = new CalendarCache();

// Export function to invalidate specific calendar data
export const invalidateCalendarCache = (endpoint?: string, params?: Record<string, any>): void => {
  if (endpoint) {
    calendarCache.invalidateByEndpoint(endpoint, params);
  } else {
    calendarCache.invalidate();
  }
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
    
    // Check if there's already an in-flight request for this data
    const inFlightRequest = calendarCache.getInFlightRequest('getCalendarDataHttp', { month, year });
    if (inFlightRequest) {
      return inFlightRequest;
    }
    
    const baseUrl = getFunctionBaseUrl();
    const idToken = await getIdToken();
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('No authenticated user');
    }

    // Check if we're masquerading
    let userId;
    
    // Get masquerade state from session storage
    const masqueradeUserStr = sessionStorage.getItem('masqueradeUser');
    if (masqueradeUserStr) {
      try {
        const masqueradeUser = JSON.parse(masqueradeUserStr);
        if (masqueradeUser && masqueradeUser.id) {
          // If masquerading, use the masqueraded user's ID
          userId = masqueradeUser.id;
        }
      } catch (error) {
        console.error('Error parsing masquerade user from session storage:', error);
      }
    }
    
    // If not masquerading, get the current user's document ID
    if (!userId) {
      const userDocs = await getCachedCollection('users', [
        where('email', '==', user.email)
      ], {
        includeIds: true
      });

      const userDoc = userDocs[0];
      if (!userDoc) {
        throw new Error('User not found');
      }
      userId = userDoc.id;
    }
    
    const url = `${baseUrl}/getCalendarDataHttp?month=${month}&year=${year}&userId=${userId}`;
    
    // Create the fetch promise
    const fetchPromise = fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(errorData => {
          throw new Error(errorData.error || 'Failed to fetch calendar data');
        });
      }
      return response.json();
    })
    .then(data => {
      // Store in cache
      calendarCache.set('getCalendarDataHttp', { month, year }, data);
      return data;
    });
    
    // Register this as an in-flight request
    calendarCache.setInFlightRequest('getCalendarDataHttp', { month, year }, fetchPromise);
    
    return fetchPromise;
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
      
      // Check if there's already an in-flight request for this data
      const inFlightRequest = calendarCache.getInFlightRequest('getAllClassesForMonthHttp', { month, year });
      if (inFlightRequest) {
        return inFlightRequest;
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
    
    // Create the fetch promise
    const fetchPromise = fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(errorData => {
          throw new Error(errorData.error || 'Failed to fetch all classes for month');
        });
      }
      return response.json();
    })
    .then(data => {
      // Store in cache if not bypassing
      if (!options.bypassCache) {
        calendarCache.set('getAllClassesForMonthHttp', { month, year }, data);
      }
      return data;
    });
    
    // Register this as an in-flight request if not bypassing cache
    if (!options.bypassCache) {
      calendarCache.setInFlightRequest('getAllClassesForMonthHttp', { month, year }, fetchPromise);
    }
    
    return fetchPromise;
  } catch (error) {
    console.error('Error fetching all classes for month:', error);
    throw error;
  }
}; 
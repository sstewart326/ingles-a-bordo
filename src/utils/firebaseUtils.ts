import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  getDoc,
  DocumentData,
  QueryConstraint,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  where
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { cache } from './cache';
import { getFunctions } from 'firebase/functions';
import { getAuth } from 'firebase/auth';

// Collections that should never be cached under any circumstances
const NEVER_CACHE_COLLECTIONS = new Set(['signupLinks']);

// Collections that can only be cached for the current user's own data
const USER_SCOPED_COLLECTIONS = new Set(['users']);

interface CacheOptions {
  includeIds?: boolean;
  userId?: string | null; // Current user's ID for scoping
  bypassCache?: boolean; // Whether to bypass the cache
}

// Function to safely encode cache keys
const encodeCacheKey = (key: string): string => {
  return encodeURIComponent(key).replace(/[.#$/[\]]/g, '_');
};

// Function to rehydrate timestamps in cached data
const rehydrateTimestamps = (data: unknown): unknown => {
  if (!data) return data;
  
  if (Array.isArray(data)) {
    return data.map(item => rehydrateTimestamps(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    const result: Record<string, unknown> = { ...data as Record<string, unknown> };
    for (const key in result) {
      const value = result[key];
      if (value && typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value) {
        result[key] = new Timestamp(value.seconds as number, value.nanoseconds as number);
      } else if (typeof value === 'object') {
        result[key] = rehydrateTimestamps(value);
      }
    }
    return result;
  }
  
  return data;
};

// Function to determine if data should be cached
const shouldCache = (collectionPath: string, options: CacheOptions = {}): boolean => {
  if (options.bypassCache) {
    return false;
  }

  if (NEVER_CACHE_COLLECTIONS.has(collectionPath)) {
    return false;
  }

  // If it's a user-scoped collection, only cache if we have a userId
  if (USER_SCOPED_COLLECTIONS.has(collectionPath)) {
    return !!options.userId;
  }

  // For all other collections, we can cache
  return true;
};

// Helper function to log Firebase queries in non-production environments
export const logQuery = (operation: string, details?: any) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Firebase Query] ${operation}`, details || '');
  }
};

// Helper function to log user operations in non-production environments
export const logUserOp = (operation: string, details?: any) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[User Operation] ${operation}`, details || '');
  }
};

// Track in-flight requests with proper typing
const inFlightRequests: Record<string, Promise<unknown> | undefined> = {};

// Helper function to get admin/teacher document ID from auth ID
export const getAdminDocId = async (authUid: string): Promise<string | null> => {
  try {
    logUserOp('Getting admin document ID', { authUid });
    const querySnapshot = await getDocs(
      query(collection(db, 'users'), 
        where('uid', '==', authUid)
      )
    );
    
    if (querySnapshot.empty) {
      logUserOp('No admin document found', { authUid });
      return null;
    }

    const docId = querySnapshot.docs[0].id;
    logUserOp('Found admin document', { authUid, docId });
    return docId;
  } catch (error) {
    logUserOp('Error getting admin document', { authUid, error });
    return null;
  }
};

// Helper function to get the base URL for Firebase Functions
/**
 * Gets the base URL for Firebase Functions, handling both development and production environments.
 * @returns string - The base URL for Firebase Functions
 */
export const getFunctionBaseUrl = () => {
  const functions = getFunctions();
  const isDevelopment = import.meta.env.MODE === 'development';
  
  return isDevelopment
    ? `http://localhost:5001/${functions.app.options.projectId}/${functions.region}`
    : `${functions.customDomain || `https://${functions.region}-${functions.app.options.projectId}.cloudfunctions.net`}`;
};

// Helper function to get the current user's ID token
/**
 * Gets the current user's ID token for authentication.
 * @returns Promise<string> - The user's ID token
 * @throws Error if no authenticated user is found
 */
export const getIdToken = async (): Promise<string> => {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error('No authenticated user');
  }
  
  return user.getIdToken();
};

// Helper function to invalidate payment app tokens for admin users
/**
 * Invalidates payment app tokens by calling the signout HTTP function.
 * This ensures that admin users are completely signed out from the payment app.
 * @param idToken - The Firebase ID token for authentication
 * @returns Promise<boolean> - True if tokens were successfully invalidated, false otherwise
 */
export const invalidatePaymentAppTokens = async (idToken: string): Promise<boolean> => {
  try {
    logUserOp('Invalidating payment app tokens');
    const baseUrl = getFunctionBaseUrl();
    const response = await fetch(`${baseUrl}/signoutHttpRequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      logUserOp('Successfully invalidated payment app tokens');
      return true;
    } else {
      logUserOp('Failed to invalidate payment app tokens', { status: response.status });
      return false;
    }
  } catch (error) {
    logUserOp('Error invalidating payment app tokens', { error });
    return false;
  }
};

// Function to get users for a teacher with caching and in-flight request handling
export const getTeacherUsers = async <T = DocumentData>(
  teacherAuthId: string,
  options: CacheOptions = {}
): Promise<T[]> => {
  logUserOp('Starting teacher users query', { teacherAuthId });
  
  // First get the teacher's document ID
  const teacherId = await getAdminDocId(teacherAuthId);
  if (!teacherId) {
    logUserOp('No teacher document found, returning empty list', { teacherAuthId });
    return [];
  }
  
  const cacheKey = `teacher_users_${teacherId}`;
  logUserOp('Using cache key', { cacheKey });
  
  // Check if there's an in-flight request
  const existingRequest = inFlightRequests[cacheKey];
  if (existingRequest) {
    logUserOp('Returning in-flight request for teacher users', { teacherId });
    // Clone and add cleanup to the existing request
    return existingRequest.then(
      (result) => {
        return result as T[];
      },
      (error) => {
        throw error;
      }
    ).finally(() => {
      // Also clean up when this promise completes
      if (inFlightRequests[cacheKey] === existingRequest) {
        delete inFlightRequests[cacheKey];
      }
    }) as Promise<T[]>;
  }

  // Create the request promise
  const promise = (async () => {
    try {
      // Check cache first
      if (shouldCache('users', options)) {
        const cachedData = cache.get<T[]>(cacheKey);
        if (cachedData !== null) {
          logUserOp('Returning cached teacher users', { teacherId, count: cachedData.length });
          return rehydrateTimestamps(cachedData) as T[];
        }
      }

      // Query users where teacher field matches teacherId
      logUserOp('Querying teacher users from Firestore', { teacherId });
      const querySnapshot = await getDocs(
        query(collection(db, 'users'), 
          where('teacher', '==', teacherId),
          where('isAdmin', '==', false),
          where('isTeacher', '==', false)
        )
      );
      
      logUserOp('Teacher users query result', { teacherId, size: querySnapshot.docs.length });
      const data = querySnapshot.docs.map((doc) => ({ 
        id: doc.id, 
        ...doc.data() 
      })) as T[];

      // Cache the result
      if (shouldCache('users', options)) {
        cache.set(cacheKey, data);
        logUserOp('Cached teacher users', { teacherId, count: data.length });
      }
      
      return data;
    } catch (error) {
      logUserOp('Error getting teacher users', { teacherId, error });
      throw error;
    }
  })();

  inFlightRequests[cacheKey] = promise;
  
  // Add a finally handler to clean up the in-flight request
  promise.finally(() => {
    // Clean up the in-flight request
    if (inFlightRequests[cacheKey] === promise) {
      delete inFlightRequests[cacheKey];
    }
  });
  
  return promise;
};

// Function to get classes for specific users with caching and in-flight request handling
export const getUsersClasses = async <T = DocumentData>(
  userEmails: string[],
  options: CacheOptions = {}
): Promise<T[]> => {
  if (!userEmails.length) return [];
  
  const cacheKey = `users_classes_${userEmails.sort().join('_')}`;
  
  logUserOp('Getting users classes', { userCount: userEmails.length });
  
  // Check if there's an in-flight request
  const existingRequest = inFlightRequests[cacheKey];
  if (existingRequest) {
    logUserOp('Returning in-flight request for users classes', { userCount: userEmails.length });
    // Clone and add cleanup to the existing request
    return existingRequest.then(
      (result) => {
        return result as T[];
      },
      (error) => {
        throw error;
      }
    ).finally(() => {
      // Also clean up when this promise completes
      if (inFlightRequests[cacheKey] === existingRequest) {
        delete inFlightRequests[cacheKey];
      }
    }) as Promise<T[]>;
  }

  // Create the request promise
  const promise = (async () => {
    try {
      // Check cache first
      if (shouldCache('classes', options)) {
        const cachedData = cache.get<T[]>(cacheKey);
        if (cachedData !== null) {
          logUserOp('Returning cached users classes', { userCount: userEmails.length, classCount: cachedData.length });
          return rehydrateTimestamps(cachedData) as T[];
        }
      }

      // Firestore has a limit of 10 items for array-contains-any queries
      // So we need to batch the requests if we have more than 10 emails
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < userEmails.length; i += batchSize) {
        const batch = userEmails.slice(i, i + batchSize);
        batches.push(batch);
      }

      // Execute all batch queries
      logUserOp('Querying users classes from Firestore', { batchCount: batches.length, totalUsers: userEmails.length });
      const batchQueries = batches.map(batch =>
        getDocs(query(
          collection(db, 'classes'),
          where('studentEmails', 'array-contains-any', batch)
        ))
      );

      const batchResults = await Promise.all(batchQueries);

      // Combine results, avoiding duplicates
      const classesMap = new Map();
      batchResults.forEach(querySnapshot => {
        querySnapshot.docs.forEach(doc => {
          classesMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
      });

      const data = Array.from(classesMap.values()) as T[];
      logUserOp('Users classes query result', { userCount: userEmails.length, classCount: data.length });

      // Cache the result
      if (shouldCache('classes', options)) {
        cache.set(cacheKey, data);
        logUserOp('Cached users classes', { userCount: userEmails.length, classCount: data.length });
      }

      return data;
    } catch (error) {
      logUserOp('Error getting users classes', { userCount: userEmails.length, error });
      throw error;
    } finally {
      // Clean up the in-flight request
      delete inFlightRequests[cacheKey];
    }
  })();

  inFlightRequests[cacheKey] = promise;
  return promise;
};

// Function to get collection data with caching
export const getCachedCollection = async <T = DocumentData>(
  collectionPath: string,
  queryConstraints: QueryConstraint[] = [],
  options: CacheOptions = {}
): Promise<T[]> => {
  const cacheKey = encodeCacheKey(`${collectionPath}${options.userId || ''}`);
  logQuery('Getting collection', { collectionPath, cacheKey });

  // Check if there's an in-flight request
  const existingRequest = inFlightRequests[cacheKey];
  if (existingRequest) {
    logQuery('Returning in-flight request', { collectionPath, cacheKey });
    // Clone and add cleanup to the existing request
    return existingRequest.then(
      (result) => {
        return result as T[];
      },
      (error) => {
        throw error;
      }
    ).finally(() => {
      // Also clean up when this promise completes
      if (inFlightRequests[cacheKey] === existingRequest) {
        delete inFlightRequests[cacheKey];
      }
    }) as Promise<T[]>;
  }

  // Create the request promise
  const promise = (async () => {
    try {
      // Check cache first
      if (shouldCache(collectionPath, options)) {
        const cachedData = cache.get<T[]>(cacheKey);
        if (cachedData !== null) {
          logQuery('Returning cached collection', { collectionPath, size: cachedData.length });
          return rehydrateTimestamps(cachedData) as T[];
        }
      }

      // If not in cache or shouldn't cache, query Firestore
      logQuery('Querying collection from Firestore', { collectionPath, queryConstraints });
      const querySnapshot = await getDocs(
        query(collection(db, collectionPath), ...queryConstraints)
      );
      const data = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
      logQuery('Collection query result', { collectionPath, size: data.length });

      // Cache the result if we should
      if (shouldCache(collectionPath, options)) {
        cache.set(cacheKey, data);
        logQuery('Cached collection data', { collectionPath, size: data.length });
      }
      
      return data;
    } catch (error) {
      logQuery('Error getting collection', { collectionPath, error });
      throw error;
    }
  })();

  // Store the in-flight request
  inFlightRequests[cacheKey] = promise;
  
  // Add a finally handler to clean up the in-flight request
  promise.finally(() => {
    // Clean up the in-flight request
    if (inFlightRequests[cacheKey] === promise) {
      delete inFlightRequests[cacheKey];
    }
  });
  
  return promise;
};

// Function to get document data with caching
export const getCachedDocument = async <T = DocumentData>(
  collectionPath: string,
  docId: string,
  options: CacheOptions = {}
): Promise<T | null> => {
  if (!shouldCache(collectionPath, options)) {
    const docSnapshot = await getDoc(doc(db, collectionPath, docId));
    return docSnapshot.exists()
      ? ({ id: docSnapshot.id, ...docSnapshot.data() } as T)
      : null;
  }

  const cacheKey = encodeCacheKey(`${collectionPath}/${docId}${options.userId || ''}`);
  const cachedData = cache.get<T>(cacheKey);

  if (cachedData !== null) {
    return rehydrateTimestamps(cachedData) as T;
  }

  const docSnapshot = await getDoc(doc(db, collectionPath, docId));

  if (!docSnapshot.exists()) {
    cache.set(cacheKey, null);
    return null;
  }

  const data = { id: docSnapshot.id, ...docSnapshot.data() } as T;
  cache.set(cacheKey, data);
  return data;
};

// Function to set document data and invalidate cache
export const setCachedDocument = async <T = DocumentData>(
  collectionPath: string,
  docId: string,
  data: Partial<T>,
  options: CacheOptions = {}
): Promise<void> => {
  const docRef = doc(db, collectionPath, docId);
  await setDoc(docRef, data, { merge: true });
  
  if (shouldCache(collectionPath, options)) {
    const cacheKey = encodeCacheKey(`${collectionPath}/${docId}${options.userId || ''}`);
    cache.invalidate(cacheKey);
    cache.invalidate(encodeCacheKey(`${collectionPath}${options.userId || ''}`));
  }
};

// Function to update document data and invalidate cache
export const updateCachedDocument = async <T = DocumentData>(
  collectionPath: string,
  docId: string,
  data: Partial<T>,
  options: CacheOptions = {}
): Promise<void> => {
  const docRef = doc(db, collectionPath, docId);
  await updateDoc(docRef, data as DocumentData);
  
  if (shouldCache(collectionPath, options)) {
    const cacheKey = encodeCacheKey(`${collectionPath}/${docId}${options.userId || ''}`);
    cache.invalidate(cacheKey);
    cache.invalidate(encodeCacheKey(`${collectionPath}${options.userId || ''}`));
  }
};

// Function to delete document and invalidate cache
export const deleteCachedDocument = async (
  collectionPath: string,
  docId: string,
  options: CacheOptions = {}
): Promise<void> => {
  const docRef = doc(db, collectionPath, docId);
  await deleteDoc(docRef);
  
  if (shouldCache(collectionPath, options)) {
    const cacheKey = encodeCacheKey(`${collectionPath}/${docId}${options.userId || ''}`);
    cache.invalidate(cacheKey);
    cache.invalidate(encodeCacheKey(`${collectionPath}${options.userId || ''}`));
  }
};

// Function to update a class session's payment link
export const updateClassPaymentLink = async (
  classId: string,
  paymentLink: string
): Promise<void> => {
  try {
    const docRef = doc(db, 'classes', classId);
    
    // Update only the payment link within the paymentConfig
    await updateDoc(docRef, {
      'paymentConfig.paymentLink': paymentLink
    });
    
    // Invalidate cache for this class
    const cacheKey = encodeCacheKey(`classes/${classId}`);
    cache.invalidate(cacheKey);
    cache.invalidate(encodeCacheKey('classes'));
    
    console.log(`Payment link updated for class ${classId}`);
  } catch (error) {
    console.error('Error updating payment link:', error);
    throw error;
  }
};

// Function to get a class by its ID
export const getClassById = async (classId: string) => {
  try {
    return await getCachedDocument('classes', classId);
  } catch (error) {
    console.error('Error fetching class by ID:', error);
    throw error;
  }
}; 
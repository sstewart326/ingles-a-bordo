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
  Timestamp
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { cache } from './cache';

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

  if (options.userId) {
    const shouldCacheUser = USER_SCOPED_COLLECTIONS.has(collectionPath);
    return shouldCacheUser;
  }

  return true;
};

// Function to get collection data with caching
export const getCachedCollection = async <T = DocumentData>(
  collectionPath: string,
  queryConstraints: QueryConstraint[] = [],
  options: CacheOptions = {}
): Promise<T[]> => {
  if (!shouldCache(collectionPath, options)) {
    const querySnapshot = await getDocs(
      query(collection(db, collectionPath), ...queryConstraints)
    );
    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];
  }

  const queryKey = encodeCacheKey(`${collectionPath}${options.userId || ''}`);
  const cachedData = cache.get<T[]>(queryKey);

  if (cachedData !== null) {
    return rehydrateTimestamps(cachedData) as T[];
  }

  const querySnapshot = await getDocs(
    query(collection(db, collectionPath), ...queryConstraints)
  );
  const data = querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as T[];

  cache.set(queryKey, data);
  
  return data;
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
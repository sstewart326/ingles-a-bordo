import { DocumentData, QuerySnapshot, DocumentSnapshot } from 'firebase/firestore';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  collectionPath?: string;
}

const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const cache = new Map<string, CacheEntry<unknown>>();

export const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > CACHE_EXPIRATION) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
};

export const setCached = <T>(key: string, data: T, collectionPath?: string): void => {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    collectionPath,
  });
};

export const invalidateCache = (collectionPath: string): void => {
  for (const [key, entry] of cache.entries()) {
    if (entry.collectionPath === collectionPath) {
      cache.delete(key);
    }
  }
};

// Helper functions for common Firebase data types
export const cacheQuerySnapshot = (
  key: string,
  snapshot: QuerySnapshot<DocumentData>,
  collectionPath: string
): void => {
  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  setCached(key, data, collectionPath);
};

export const cacheDocumentSnapshot = (
  key: string,
  snapshot: DocumentSnapshot<DocumentData>,
  collectionPath: string
): void => {
  const data = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
  setCached(key, data, collectionPath);
};

/**
 * Clears all cache entries that have keys starting with the given prefix
 */
export const clearCacheByPrefix = (prefix: string): void => {
  for (const [key] of cache.entries()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}; 
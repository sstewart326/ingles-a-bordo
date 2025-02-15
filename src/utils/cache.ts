interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export interface ICache {
  get<T>(key: string): T | null;
  set<T>(key: string, data: T): void;
  delete(key: string): void;
  invalidate(path: string): void;
  clearAll(): void;
}

class Cache implements ICache {
  private memoryCache = new Map<string, CacheEntry<unknown>>();

  constructor() {
    // No initialization needed for memory-only cache
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > CACHE_EXPIRATION;
  }

  get<T>(key: string): T | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      this.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now()
    };

    this.memoryCache.set(key, entry);
  }

  delete(key: string): void {
    this.memoryCache.delete(key);
  }

  invalidate(path: string): void {
    // Get all keys that need to be invalidated
    const keysToInvalidate = Array.from(this.memoryCache.entries())
      .filter(([key]) => key.startsWith(path))
      .map(([key]) => key);

    // Delete each key
    keysToInvalidate.forEach(key => {
      this.delete(key);
    });
  }

  clearAll(): void {
    this.memoryCache.clear();
  }
}

// Export a singleton instance
export const cache = new Cache(); 
/**
 * Simple LRU cache for static content records (activities, templates, etc.).
 * These are identical for all authenticated users, so a shared
 * process-global cache is safe regardless of which client fetches the data.
 *
 * With ~2000 concurrent students loading the same ~10 activities,
 * this avoids redundant DB reads on every page load.
 */

const MAX_ENTRIES = 50;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

type CacheEntry = {
  value: unknown;
  expires: number;
};

const cache = new Map<string, CacheEntry>();

export function getCached<T>(id: string): T | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    cache.delete(id);
    return null;
  }
  // Move to end (LRU refresh)
  cache.delete(id);
  cache.set(id, entry);
  return entry.value as T;
}

export function setCached(id: string, value: unknown): void {
  // Evict oldest if at capacity
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(id, { value, expires: Date.now() + TTL_MS });
}

export function clearCache(): void {
  cache.clear();
}

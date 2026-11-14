/**
 * Slow, slowly changing parts of the administration's status, kept in the web process (owner, 14 November 2026: the
 * admin tabs took ~17 s to load, ~11 s of it the recovery forecast reading every task of the batch).
 *
 * Stale-while-revalidate: a value younger than its TTL is served as is; an older one is served at once while one
 * background read replaces it; only the first read (or one far past its TTL, when background reads keep failing)
 * waits. Concurrent readers share a single load. `at` is when the value was read, so a page can say so.
 */
interface Entry { value: unknown; at: number; pending?: Promise<Cached<unknown>> }
export interface Cached<T> { value: T; at: number }

const g = globalThis as unknown as { adminStatusCache?: Map<string, Entry> };
const store = () => g.adminStatusCache ??= new Map();

/** Past this many TTLs a stale value is no longer served: the reader waits for a fresh one. */
const MAX_STALE_TTLS = 6;

export function cachedRead<T>(key: string, ttlMs: number, load: () => Promise<T>, now: () => number = Date.now): Promise<Cached<T>> {
  const entries = store(), entry = entries.get(key);
  const refresh = (): Promise<Cached<T>> => {
    const current = entries.get(key);
    if (current?.pending) return current.pending as Promise<Cached<T>>;
    const pending = load().then(value => {
      const fresh = { value, at: now() };
      entries.set(key, fresh);
      return fresh;
    }, error => {
      const kept = entries.get(key);
      if (kept) delete kept.pending;
      throw error;
    });
    entries.set(key, { value: current?.value, at: current?.at ?? 0, pending: pending as Promise<Cached<unknown>> });
    return pending;
  };
  if (!entry || entry.at === 0) return refresh();
  const age = now() - entry.at;
  if (age <= ttlMs) return Promise.resolve({ value: entry.value as T, at: entry.at });
  if (age > ttlMs * MAX_STALE_TTLS) return refresh();
  // A failed background read leaves the value in place; the next reader tries again.
  refresh().catch(() => {});
  return Promise.resolve({ value: entry.value as T, at: entry.at });
}

/** Tests only. */
export function clearStatusCache() { store().clear(); }

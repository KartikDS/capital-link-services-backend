/**
 * A short-lived, in-process cache for reads that are expensive and may be a
 * little stale.
 *
 * Built for the back office's `COUNT(*)`s. CLS's tables carry no index on the
 * columns those counts filter on (`order_type`, `status`, `order_id` on the child
 * tables) and the schema is not ours to change, so each count is a full table
 * scan — seconds, not milliseconds. A total that is a minute old is still the
 * right answer for a pager or a rail badge; a page that takes ten seconds to open
 * is not.
 *
 * Concurrent callers for the same key share one in-flight read rather than each
 * starting a scan, and a failed read is never cached.
 */

interface Entry<T> {
  expiresAt: number;
  value: Promise<T>;
}

const MAX_ENTRIES = 500;
const entries = new Map<string, Entry<unknown>>();

export const cached = <T>(
  key: string,
  ttlMs: number,
  read: () => Promise<T>
): Promise<T> => {
  const now = Date.now();
  const hit = entries.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  if (entries.size >= MAX_ENTRIES) {
    for (const [k, e] of entries) {
      if (e.expiresAt <= now) entries.delete(k);
    }
    // Still full of live entries (a burst of distinct searches): drop the oldest.
    if (entries.size >= MAX_ENTRIES) {
      const oldest = entries.keys().next().value;
      if (oldest !== undefined) entries.delete(oldest);
    }
  }

  const value = read().catch((error: unknown) => {
    entries.delete(key);
    throw error;
  });
  entries.set(key, { expiresAt: now + ttlMs, value });
  return value;
};

/** For tests. */
export const clearTtlCache = (): void => entries.clear();

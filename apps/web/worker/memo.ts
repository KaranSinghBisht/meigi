// A small per-isolate cache of promises. A success is kept for `ttlMs`, or for what `ttlMs` works out from the value;
// a failure only for `failMs`, so an outage costs MultiBaas one call per window instead of one per visitor.

export type Ttl<T> = number | ((value: T) => number)
export type Memo = <T>(key: string, ttlMs: Ttl<T>, load: () => Promise<T>) => Promise<T>

export function createMemo(now: () => number = Date.now, failMs = 15_000): Memo {
  const entries = new Map<string, { until: number; value: Promise<unknown> }>()
  return <T>(key: string, ttlMs: Ttl<T>, load: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key)
    if (hit && hit.until > now()) return hit.value as Promise<T>
    const value = load()
    // Until it settles, a load is shared for its fixed TTL, or for `failMs` when the TTL depends on the value.
    const entry = { until: now() + (typeof ttlMs === 'number' ? ttlMs : failMs), value: value as Promise<unknown> }
    entries.set(key, entry)
    value.then(
      (loaded) => {
        if (typeof ttlMs !== 'number') entry.until = now() + ttlMs(loaded)
      },
      () => {
        entry.until = Math.min(entry.until, now() + failMs)
      },
    )
    return value
  }
}

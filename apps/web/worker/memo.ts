// A small per-isolate cache of promises. A success is kept for `ttlMs`; a failure only for `failMs`, so an outage
// costs MultiBaas one call per window instead of one per visitor.

export type Memo = <T>(key: string, ttlMs: number, load: () => Promise<T>) => Promise<T>

export function createMemo(now: () => number = Date.now, failMs = 15_000): Memo {
  const entries = new Map<string, { until: number; value: Promise<unknown> }>()
  return <T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> => {
    const hit = entries.get(key)
    if (hit && hit.until > now()) return hit.value as Promise<T>
    const value = load()
    const entry = { until: now() + ttlMs, value: value as Promise<unknown> }
    entries.set(key, entry)
    value.catch(() => {
      entry.until = Math.min(entry.until, now() + failMs)
    })
    return value
  }
}

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

// Per-tab persistence for multi-step flows, so a reload mid-registration doesn't lose the verifier's ids.
// Storage can be unavailable (private mode, blocked site data); the flow then simply isn't persisted.

function read<T>(key: string, fallback: T, revive: (value: unknown) => T | null): T {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (raw === null) return fallback
    return revive(JSON.parse(raw)) ?? fallback
  } catch {
    return fallback
  }
}

export function useSessionState<T>(
  key: string,
  fallback: T,
  revive: (value: unknown) => T | null,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback, revive))

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      // Not persisted: storage is unavailable in this browser context. The in-memory state still works.
    }
  }, [key, value])

  const clear = useCallback(() => {
    try {
      window.sessionStorage.removeItem(key)
    } catch {
      // Nothing to clear when storage is unavailable.
    }
    setValue(fallback)
  }, [key, fallback])

  return [value, setValue, clear]
}

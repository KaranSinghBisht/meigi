// Shared state between the pages and the one persistent stage: whether the live world is on screen, and a
// station a page can hold for a moment (the landing's enter glide moves to 'gate' before the route changes).

import { useSyncExternalStore } from 'react'
import type { Station } from './stations'

interface StageState {
  readonly live: boolean
  readonly hold: Station | null
}

let state: StageState = { live: false, hold: null }
const listeners = new Set<() => void>()

function set(next: Partial<StageState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const stage = {
  /** The canvas has drawn its first frame (false again if WebGL goes away). */
  setLive: (live: boolean) => set({ live }),
  /** Holds the camera at `station` regardless of the route; null follows the route again. */
  hold: (station: Station | null) => set({ hold: station }),
}

export function useStage(): StageState {
  return useSyncExternalStore(subscribe, () => state)
}

import { useEffect } from 'react'
import { sceneEvents } from './scene'
import type { Mood } from './stations'

/** Tints the world while `mood` is set (a refusal, a payment, a frozen payee); calm again when it clears or unmounts. */
export function useSceneMood(mood: Mood | null): void {
  useEffect(() => {
    if (!mood) return
    sceneEvents.mood(mood)
    return () => sceneEvents.mood('calm')
  }, [mood])
}

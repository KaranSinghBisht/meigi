import { sceneBus } from './shared/sceneBus'
import type { SceneMood } from './types'

export interface SceneEvents {
  /** Drops a ripple in the middle of the visible lake: 1 is a finger tap, 3 a thrown stone. */
  ripple(strength?: number): void
  /** Changes the scene's mood. Safe to call before the stage has mounted. */
  mood(kind: SceneMood): void
  /** Fires once, the first time anyone disturbs the water. Returns an unsubscribe. */
  onFirstRipple(listener: () => void): () => void
}

/** Imperative hooks into the scene. Three.js-free, so UI code can import it statically. */
export const sceneEvents: SceneEvents = {
  ripple: (strength = 1) => sceneBus.requestCenterRipple(strength),
  mood: (kind) => sceneBus.setMood(kind),
  onFirstRipple: (listener) => sceneBus.onFirstRipple(listener),
}

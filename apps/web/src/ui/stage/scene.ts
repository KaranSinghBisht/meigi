// The one seam between the app and the shared Sakasa Fuji world (@meigi/scene). Three.js-free: the canvas itself
// is lazy-loaded from '@meigi/scene/stage' by SceneLayer, so pages never wait for WebGL.

import { sceneEvents as world, type SceneMood } from '@meigi/scene/lite'

export { FallbackScene, GLIDE_SECONDS, seededRandom, supportsScene } from '@meigi/scene/lite'

export const sceneEvents = {
  /** The live stage tints itself; the still fallback reads the mood from the root element. */
  mood(kind: SceneMood): void {
    document.documentElement.dataset.sceneMood = kind
    world.mood(kind)
  },
  ripple(strength?: number): void {
    world.ripple(strength)
  },
  /** Fires once, the first time a visitor disturbs the water. Returns an unsubscribe. */
  onFirstRipple(listener: () => void): () => void {
    return world.onFirstRipple(listener)
  },
}

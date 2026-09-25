// The one seam between the app and the shared Sakasa Fuji world (@meigi/scene). Three.js-free: the canvas itself
// is lazy-loaded from '@meigi/scene/stage' by SceneLayer, so pages never wait for WebGL.

import { sceneEvents as world, type SceneMood } from '@meigi/scene/lite'

export { FallbackScene, supportsScene } from '@meigi/scene/lite'

export const sceneEvents = {
  /** The live stage tints itself; the still fallback reads the mood from the root element. */
  mood(kind: SceneMood): void {
    document.documentElement.dataset.sceneMood = kind
    world.mood(kind)
  },
  ripple(strength?: number): void {
    world.ripple(strength)
  },
}

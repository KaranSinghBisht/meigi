// Three.js-free entry: safe to import statically from app UI. Load the canvas
// itself lazily from '@meigi/scene/stage' (or '@meigi/scene').

export type { MeigiStageProps, SceneMood, Station } from './types'
export { GLIDE_SECONDS, STATION_SECONDS } from './timing'
export { sceneEvents, type SceneEvents } from './events'
export { supportsScene } from './shared/webgl'
export { FallbackScene } from './fallback/FallbackScene'
export { StageBoundary as SceneBoundary } from './StageBoundary'
export { seededRandom } from './shared/noise'

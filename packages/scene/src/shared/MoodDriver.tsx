import { useFrame } from '@react-three/fiber'
import { FRAME, sceneBus, type MoodLevels } from './sceneBus'

const TINT_SECONDS = 0.7
const GUST_SECONDS = 1.8
const MIST_SECONDS = 1.3

function settle(mood: MoodLevels): void {
  mood.tint = 0
  mood.gust = 0
  mood.burst = false
  mood.mist = mood.mistTarget
}

function isMoving(mood: MoodLevels): boolean {
  return mood.tint > 0.005 || mood.gust > 0.005 || Math.abs(mood.mistTarget - mood.mist) > 0.005
}

/**
 * Eases the mood levels every frame: the tint and the gust decay, the mist
 * approaches its target. Under reduced motion they snap to their end state.
 */
export function MoodDriver({ animate }: { readonly animate: boolean }) {
  useFrame((_, delta) => {
    const mood = sceneBus.mood
    if (!animate) {
      settle(mood)
      return
    }
    const dt = Math.min(delta, 0.1)
    mood.tint *= Math.exp(-dt / TINT_SECONDS)
    mood.gust *= Math.exp(-dt / GUST_SECONDS)
    mood.mist += (mood.mistTarget - mood.mist) * (1 - Math.exp(-dt / MIST_SECONDS))
    if (isMoving(mood)) sceneBus.keepAwake(200)
  }, FRAME.mood)

  return null
}

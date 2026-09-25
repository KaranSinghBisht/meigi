// Dev harness for @meigi/scene: stations, moods and power modes side by side.
// Query params for screenshots: ?station=fuji&mood=frozen&lowPower&still&bare
import { StrictMode, Suspense, lazy, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FallbackScene, SceneBoundary, sceneEvents, supportsScene, type SceneMood, type Station } from '../src/lite'

const MeigiStage = lazy(() => import('../src/stage'))

const STATIONS: readonly Station[] = ['hero', 'gate', 'fuji', 'lake', 'shore', 'torii', 'sky']
const MOODS: readonly SceneMood[] = ['calm', 'ok', 'refused', 'frozen']
const params = new URLSearchParams(window.location.search)

function initialStation(): Station {
  const asked = params.get('station')
  return STATIONS.find((station) => station === asked) ?? 'gate'
}

const initialMood = MOODS.find((mood) => mood === params.get('mood'))
if (initialMood) sceneEvents.mood(initialMood)

function Harness() {
  const [station, setStation] = useState(initialStation)
  const [lowPower, setLowPower] = useState(params.has('lowPower'))
  const [lost, setLost] = useState(!supportsScene())
  const still = params.has('still')
  return (
    <>
      <div className="layer">
        {lost ? (
          <FallbackScene />
        ) : (
          <SceneBoundary onError={() => setLost(true)}>
            <Suspense fallback={null}>
              <MeigiStage station={station} reducedMotion={still} lowPower={lowPower} onLost={() => setLost(true)} />
            </Suspense>
          </SceneBoundary>
        )}
      </div>
      <div className={params.has('bare') ? 'panel hidden' : 'panel'}>
        {STATIONS.map((name) => (
          <button key={name} type="button" aria-pressed={station === name} onClick={() => setStation(name)}>
            {name}
          </button>
        ))}
        {MOODS.map((mood) => (
          <button key={mood} type="button" onClick={() => sceneEvents.mood(mood)}>
            mood: {mood}
          </button>
        ))}
        <button type="button" onClick={() => sceneEvents.ripple(2)}>
          ripple
        </button>
        <button type="button" aria-pressed={lowPower} onClick={() => setLowPower((was) => !was)}>
          low power
        </button>
      </div>
    </>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root')
createRoot(root).render(
  <StrictMode>
    <Harness />
  </StrictMode>,
)

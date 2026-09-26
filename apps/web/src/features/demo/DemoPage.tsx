import { useEffect } from 'react'
import { Link } from 'react-router'
import { sceneEvents } from '../../ui/stage/scene'
import { SceneLayer } from '../../ui/stage/SceneLayer'
import { GlassFilters } from '../../ui/styles/GlassFilters'
import { DemoPlayer } from './DemoPlayer'
import './demo.css'

const WAKE_EVERY_MS = 4000

/**
 * Off the landing, the world renders on demand and sleeps once nothing moves (SceneLayer's low power), which froze the
 * petals behind the player. 'calm' is the resting mood; each call keeps the on-demand canvas drawing for 5 s more.
 */
function useSceneAwake(): void {
  useEffect(() => {
    const wake = () => sceneEvents.mood('calm')
    wake()
    const timer = window.setInterval(wake, WAKE_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [])
}

/**
 * /demo: the player alone, full-bleed over the softly blurred Sakasa Fuji world, for the video and the booth. It has
 * no app shell, so a small link above the player leads back to the app (full screen shows the player alone).
 */
export default function DemoPage() {
  useSceneAwake()
  useEffect(() => {
    const previous = document.title
    document.title = 'Demo · Meigi'
    return () => {
      document.title = previous
    }
  }, [])
  return (
    <div className="demo-page">
      <div className="demo-page__world" aria-hidden="true">
        <SceneLayer />
      </div>
      <GlassFilters />
      <main className="demo-page__main">
        <h1 className="sr-only">Meigi demo</h1>
        <Link className="btn btn--ghost btn--sm demo-page__back" to="/start">
          <span aria-hidden="true">←</span>
          <span className="sr-only">Back to</span> Meigi
        </Link>
        <DemoPlayer variant="full" />
      </main>
    </div>
  )
}

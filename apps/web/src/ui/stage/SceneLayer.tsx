import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { FallbackScene, supportsScene } from './scene'
import { SceneBoundary } from './SceneBoundary'
import { stage, useStage } from './stageStore'
import { stationFor } from './stations'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import './stage.css'

// three.js only loads where WebGL2 works; everything else keeps the still world.
const MeigiStage = lazy(() => import('@meigi/scene/stage'))

/**
 * The world behind every page: one fixed layer that stays mounted across routes, so moving between flows (and
 * entering from the landing hero) eases the camera instead of reloading the scene. On the hero the water answers
 * the pointer and the world keeps moving, as on the landing; on the app's pages it renders only while something
 * moves and ignores the pointer, so forms stay responsive. The still world shows until the canvas has drawn, and
 * for good when WebGL is missing or lost. Decorative only.
 */
export function SceneLayer() {
  const { pathname } = useLocation()
  const { hold } = useStage()
  const station = hold ?? stationFor(pathname)
  const hero = pathname === '/'
  const reducedMotion = usePrefersReducedMotion()
  const [live, setLive] = useState(supportsScene)
  const [ready, setReady] = useState(false)
  const lose = useCallback(() => setLive(false), [])
  const onReady = useCallback(() => setReady(true), [])
  const showing = live && ready ? 'live' : 'still'
  useEffect(() => stage.setLive(showing === 'live'), [showing])
  return (
    <div className="scene-layer" data-kind={showing} data-station={station} aria-hidden="true">
      {showing === 'still' ? (
        <div className="scene-still">
          <FallbackScene />
        </div>
      ) : null}
      {live ? (
        <SceneBoundary onError={lose}>
          <Suspense fallback={null}>
            <MeigiStage
              className={ready ? 'scene-canvas is-ready' : 'scene-canvas'}
              station={station}
              reducedMotion={reducedMotion}
              interactive={hero}
              lowPower={!hero}
              onReady={onReady}
              onLost={lose}
            />
          </Suspense>
        </SceneBoundary>
      ) : null}
    </div>
  )
}

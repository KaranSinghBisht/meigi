import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { env } from './lib/env/env'
import { usePrefersReducedMotion } from './lib/motion/useMediaQuery'
import { sceneBus } from './scene/shared/sceneBus'
import { supportsScene } from './scene/shared/webgl'
import { HankoCursor } from './ui/cursor/HankoCursor'
import { SealLayer, useSealStamps } from './ui/cursor/SealStamps'
import { FallbackScene } from './ui/fallback/FallbackScene'
import { StageBoundary } from './ui/fallback/StageBoundary'
import { BlossomBranch } from './ui/hero/BlossomBranch'
import { Hero } from './ui/hero/Hero'
import { RippleCaption } from './ui/hero/RippleCaption'
import { useEnterTransition } from './ui/hero/useEnterTransition'
import { VerticalLabel } from './ui/hero/VerticalLabel'
import { Dock } from './ui/pills/Dock'

const Stage = lazy(() => import('./scene/Stage'))
const CAPTION_MS = 3200

function useRippleCaption(): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let timer: number | undefined
    const stop = sceneBus.onFirstRipple(() => {
      setVisible(true)
      timer = window.setTimeout(() => setVisible(false), CAPTION_MS)
    })
    return () => {
      stop()
      window.clearTimeout(timer)
    }
  }, [])
  return visible
}

export function App() {
  const reducedMotion = usePrefersReducedMotion()
  const [sceneOk, setSceneOk] = useState(supportsScene)
  const [ready, setReady] = useState(false)
  const overlay = useRef<HTMLDivElement>(null)
  const whiteout = useRef<HTMLDivElement>(null)
  const seals = useSealStamps()
  const captionVisible = useRippleCaption()
  const onFail = useCallback(() => setSceneOk(false), [])
  const onReady = useCallback(() => setReady(true), [])
  const enter = useEnterTransition({ appUrl: env.appUrl, stillOnly: reducedMotion || !sceneOk, overlay, whiteout })

  return (
    <div className="page">
      <div className={ready || !sceneOk ? 'stage is-ready' : 'stage'}>
        {sceneOk ? (
          <StageBoundary onError={onFail}>
            <Suspense fallback={null}>
              <Stage reducedMotion={reducedMotion} onReady={onReady} onLost={onFail} />
            </Suspense>
          </StageBoundary>
        ) : (
          <FallbackScene />
        )}
      </div>
      <div ref={overlay} className="overlay">
        <BlossomBranch />
        <Hero appUrl={env.appUrl} onEnter={enter} onStamp={seals.stamp} />
        <VerticalLabel />
        <RippleCaption visible={captionVisible} />
        <Dock />
      </div>
      <SealLayer stamps={seals.stamps} onDone={seals.remove} />
      <HankoCursor reducedMotion={reducedMotion} />
      <div ref={whiteout} className="whiteout" aria-hidden="true" />
    </div>
  )
}

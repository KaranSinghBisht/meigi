import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { VerticalLabel } from '../../ui/brand/VerticalLabel'
import { sceneEvents } from '../../ui/stage/scene'
import { useStage } from '../../ui/stage/stageStore'
import { usePrefersReducedMotion } from '../../ui/stage/usePrefersReducedMotion'
import { HankoCursor } from './cursor/HankoCursor'
import { SealLayer, useSealStamps } from './cursor/SealStamps'
import { BlossomBranch } from './hero/BlossomBranch'
import { Hero } from './hero/Hero'
import { RippleCaption } from './hero/RippleCaption'
import { Dock } from './pills/Dock'
import { START_PATH, useEnterTransition } from './useEnterTransition'
import './landing.css'

const CAPTION_MS = 3200

function useRippleCaption(): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    let timer: number | undefined
    const stop = sceneEvents.onFirstRipple(() => {
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

/** The landing hero, now the app's first screen: the same world, and "enter" glides into the app without a reload. */
export default function LandingPage() {
  // Coming back from the app (the logo, browser back), the camera eases home first, then the hero fades in.
  const returning = useLocation().key !== 'default'
  const reducedMotion = usePrefersReducedMotion()
  const { live } = useStage()
  const overlay = useRef<HTMLDivElement>(null)
  const seals = useSealStamps()
  const captionVisible = useRippleCaption()
  const enter = useEnterTransition({ stillOnly: reducedMotion || !live, overlay })

  return (
    <div className="landing">
      <div ref={overlay} className={returning ? 'overlay overlay--return' : 'overlay'}>
        <BlossomBranch />
        <Hero appUrl={START_PATH} onEnter={enter} onStamp={seals.stamp} />
        <VerticalLabel />
        <RippleCaption visible={captionVisible} />
        <Dock />
      </div>
      <SealLayer stamps={seals.stamps} onDone={seals.remove} />
      <HankoCursor reducedMotion={reducedMotion} />
    </div>
  )
}

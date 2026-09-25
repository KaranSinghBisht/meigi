import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { sceneBus } from './sceneBus'

type ActiveLoop = 'always' | 'demand'

/** Stops rendering entirely while the tab is hidden. */
export function VisibilityPause({ loop }: { readonly loop: ActiveLoop }) {
  const setFrameloop = useThree((state) => state.setFrameloop)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const sync = () => {
      setFrameloop(document.hidden ? 'never' : loop)
      if (!document.hidden) invalidate()
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [loop, setFrameloop, invalidate])

  return null
}

/**
 * In demand mode (low power, reduced motion) nothing renders unprompted, but
 * the composer and the reflection need a few frames after mount to settle.
 */
export function DemandPump({ enabled }: { readonly enabled: boolean }) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    if (!enabled) return
    let frames = 0
    const timer = window.setInterval(() => {
      invalidate()
      frames += 1
      if (frames >= 24) window.clearInterval(timer)
    }, 60)
    const onResize = () => invalidate()
    window.addEventListener('resize', onResize)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [enabled, invalidate])

  return null
}

/**
 * Calls onReady once a few composed frames have reached the screen. It asks
 * for the next frame itself, so a demand-mode canvas that mounted in a
 * hidden tab still gets there after the tab becomes visible.
 */
export function ReadySignal({ onReady }: { readonly onReady: () => void }) {
  const invalidate = useThree((state) => state.invalidate)
  const frames = useRef(0)
  const done = useRef(false)

  useFrame(() => {
    if (done.current) return
    frames.current += 1
    if (frames.current < 4) {
      invalidate()
      return
    }
    done.current = true
    onReady()
  })

  return null
}

/**
 * Low power: renders frame after frame while the scene is awake (a glide,
 * ripples, a mood), then stops. With `continuous` off (reduced motion) each
 * wake event renders a single frame, enough to show the new still state.
 */
export function WakeKeeper({ continuous }: { readonly continuous: boolean }) {
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => sceneBus.onWake(() => invalidate()), [invalidate])

  useFrame(() => {
    if (continuous && sceneBus.isAwake()) invalidate()
  })

  return null
}

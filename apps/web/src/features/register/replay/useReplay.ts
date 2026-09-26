import { useCallback, useEffect, useRef, useState } from 'react'
import { STEP_COUNT, type StepIndex } from '../flow/steps'

/** How long each screen stays up while playing (ms): long enough to read its question and the recorded answer. */
const DWELL: readonly number[] = [5200, 6400, 4800, 6400, 5200, 6400]
const LAST = (STEP_COUNT - 1) as StepIndex

const clamp = (step: number) => Math.min(Math.max(step, 0), LAST) as StepIndex

/**
 * The replay's position and its autoplay. Playing advances one screen per dwell and stops on the last; any
 * navigation by the reader pauses it, and so does leaving the tab. `manual` tells the window to move focus.
 */
export function useReplay() {
  const [step, setStep] = useState<StepIndex>(0)
  const [playing, setPlaying] = useState(true)
  const manual = useRef(false)

  useEffect(() => {
    if (!playing) return
    if (step >= LAST) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setStep((current) => clamp(current + 1)), DWELL[step] ?? 5000)
    return () => window.clearTimeout(timer)
  }, [playing, step])

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', hidden)
    return () => document.removeEventListener('visibilitychange', hidden)
  }, [])

  const go = useCallback((target: number) => {
    manual.current = true
    setPlaying(false)
    setStep(clamp(target))
  }, [])

  /** Play or pause; at the end it plays again from the first screen. */
  const toggle = useCallback(() => {
    if (step >= LAST) {
      setStep(0)
      setPlaying(true)
      return
    }
    setPlaying((value) => !value)
  }, [step])

  const pause = useCallback(() => setPlaying(false), [])
  return { step, playing, atEnd: step >= LAST, manual, go, toggle, pause }
}

export type Replay = ReturnType<typeof useReplay>

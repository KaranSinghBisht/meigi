import { useEffect, useState, type RefObject } from 'react'
import type { DemoClock } from './clock'

const PHONE_QUERY = '(max-width: 719px)'

/** Phones get the vertical stage: the panel under the browser. */
export function usePortrait(): boolean {
  const [portrait, setPortrait] = useState(() => window.matchMedia(PHONE_QUERY).matches)
  useEffect(() => {
    const media = window.matchMedia(PHONE_QUERY)
    const onChange = () => setPortrait(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return portrait
}

/**
 * Runs the clock while the player can be seen: it holds (without pausing) in a hidden tab or while the player
 * is scrolled away, and reduced motion stops the clock for step-by-step viewing.
 */
export function usePlayerLifecycle(clock: DemoClock, rootRef: RefObject<HTMLElement | null>, reduced: boolean): void {
  useEffect(() => clock.start(), [clock])

  useEffect(() => {
    if (!reduced) return
    clock.setPlaying(false)
    clock.snapToStep()
  }, [clock, reduced])

  useEffect(() => {
    const onVisibility = () => clock.hold('hidden', document.visibilityState === 'hidden')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [clock])

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => clock.hold('offscreen', !entry?.isIntersecting), {
      threshold: 0.15,
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [clock, rootRef])
}

const FONT_ID = 'demo-noto-sans-jp'
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;600&display=swap'

/** The mail's Japanese is set in Noto Sans JP; the app itself doesn't load it, so the player does, once. */
export function useJapaneseFont(): void {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return
    const link = document.createElement('link')
    link.id = FONT_ID
    link.rel = 'stylesheet'
    link.href = FONT_URL
    document.head.append(link)
  }, [])
}

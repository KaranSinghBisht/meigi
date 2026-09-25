import { GLIDE_SECONDS, type Station } from '@meigi/scene/lite'
import gsap from 'gsap'
import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from 'react'

interface EnterOptions {
  readonly appUrl: string
  /** Skip the camera glide: reduced motion, or no WebGL scene on screen. */
  readonly stillOnly: boolean
  readonly overlay: RefObject<HTMLElement | null>
  readonly whiteout: RefObject<HTMLElement | null>
  /** Moves the scene camera: 'gate' glides through the torii, 'hero' returns. */
  readonly onStation: (station: Station) => void
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/**
 * The enter button: the UI fades, the camera glides through the torii to the
 * app's 'gate' station, the page washes to white, then the app loads there.
 * Modified clicks (new tab, etc.) are left to the browser.
 */
export function useEnterTransition({ appUrl, stillOnly, overlay, whiteout, onStation }: EnterOptions) {
  const timeline = useRef<gsap.core.Timeline | null>(null)

  // Coming back via the back/forward cache must not leave the page white.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      timeline.current?.kill()
      timeline.current = null
      onStation('hero')
      gsap.set([overlay.current, whiteout.current], { clearProps: 'opacity' })
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [overlay, whiteout, onStation])

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainClick(event)) return
      event.preventDefault()
      if (timeline.current) return
      let leaving = false
      const go = () => {
        if (leaving) return
        leaving = true
        window.location.assign(appUrl)
      }
      const tl = gsap.timeline({ onComplete: go })
      timeline.current = tl
      // gsap ticks on requestAnimationFrame, which stops in a hidden tab: leave on a timer as well.
      window.setTimeout(go, ((stillOnly ? 0.35 : GLIDE_SECONDS) + 0.8) * 1000)
      if (stillOnly) {
        tl.to(whiteout.current, { opacity: 1, duration: 0.35, ease: 'power1.out' })
        return
      }
      onStation('gate')
      tl.to(overlay.current, { opacity: 0, duration: 0.55, ease: 'power2.out' }, 0).to(
        whiteout.current,
        { opacity: 1, duration: 0.55, ease: 'power1.in' },
        GLIDE_SECONDS - 0.5,
      )
    },
    [appUrl, stillOnly, overlay, whiteout, onStation],
  )
}

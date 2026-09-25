import gsap from 'gsap'
import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { sceneBus } from '../../scene/shared/sceneBus'

const GLIDE_SECONDS = 2.2

interface EnterOptions {
  readonly appUrl: string
  /** Skip the camera glide: reduced motion, or no WebGL scene on screen. */
  readonly stillOnly: boolean
  readonly overlay: RefObject<HTMLElement | null>
  readonly whiteout: RefObject<HTMLElement | null>
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/**
 * The enter button: the UI fades, the camera glides through the torii towards
 * Fuji, the page washes to white, then the app loads. Modified clicks
 * (new tab, etc.) are left to the browser.
 */
export function useEnterTransition({ appUrl, stillOnly, overlay, whiteout }: EnterOptions) {
  const timeline = useRef<gsap.core.Timeline | null>(null)

  // Coming back via the back/forward cache must not leave the page white.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      timeline.current?.kill()
      timeline.current = null
      sceneBus.glideActive = false
      sceneBus.glideProgress = 0
      gsap.set([overlay.current, whiteout.current], { clearProps: 'opacity' })
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [overlay, whiteout])

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainClick(event)) return
      event.preventDefault()
      if (timeline.current) return
      const go = () => window.location.assign(appUrl)
      const tl = gsap.timeline({ onComplete: go })
      timeline.current = tl
      if (stillOnly) {
        tl.to(whiteout.current, { opacity: 1, duration: 0.35, ease: 'power1.out' })
        return
      }
      const glide = { t: 0 }
      sceneBus.glideActive = true
      tl.to(overlay.current, { opacity: 0, duration: 0.55, ease: 'power2.out' }, 0)
        .to(glide, {
          t: 1,
          duration: GLIDE_SECONDS,
          ease: 'power2.inOut',
          onUpdate: () => {
            sceneBus.glideProgress = glide.t
          },
        }, 0)
        .to(whiteout.current, { opacity: 1, duration: 0.55, ease: 'power1.in' }, GLIDE_SECONDS - 0.5)
    },
    [appUrl, stillOnly, overlay, whiteout],
  )
}

import gsap from 'gsap'
import { useCallback, useEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { GLIDE_SECONDS } from '../../ui/stage/scene'
import { stage } from '../../ui/stage/stageStore'

/** Where "enter" leads: the app's start page, at the 'gate' station the glide ends on. */
export const START_PATH = '/start'

/** Reduced motion, or no live world: the overlay crossfades straight into the app. */
const CROSSFADE_SECONDS = 0.35
const OVERLAY_FADE_SECONDS = 0.55

/**
 * What fades on enter: each piece of the hero, not the overlay around them. Opacity on an ancestor would make it
 * the backdrop root and switch the glass pills' blur off for the whole fade. (landing.css fades the same pieces
 * back in on return.)
 */
const FADING = '.branch, .hero__top, .hero__subtitle, .vlabel, .caption, .pill, .resolve'

interface EnterOptions {
  /** Skip the camera glide: reduced motion, or no WebGL scene on screen. */
  readonly stillOnly: boolean
  readonly overlay: RefObject<HTMLElement | null>
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/**
 * The enter button, inside one page: the hero fades, the camera glides through the torii to 'gate' on the same
 * canvas, then the router moves to the app, whose header and panels fade in. Modified clicks (new tab, etc.)
 * follow the link as usual.
 */
export function useEnterTransition({ stillOnly, overlay }: EnterOptions) {
  const navigate = useNavigate()
  const timeline = useRef<gsap.core.Timeline | null>(null)
  const fallback = useRef<number | undefined>(undefined)

  // Leaving mid-glide (browser back, the logo) must not enter later, or leave the camera held at the gate.
  useEffect(
    () => () => {
      timeline.current?.kill()
      timeline.current = null
      window.clearTimeout(fallback.current)
      stage.hold(null)
    },
    [],
  )

  return useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!isPlainClick(event)) return
      event.preventDefault()
      if (timeline.current) return
      let entered = false
      // The camera stays held at 'gate' until this page unmounts (the cleanup above releases it), by which time the
      // route's own station is 'gate' too. Releasing it here would let the stage see '/' again before /start commits,
      // and glide back through the torii and forward again.
      const go = () => {
        if (entered) return
        entered = true
        navigate(START_PATH, { state: { entered: true } })
      }
      const seconds = stillOnly ? CROSSFADE_SECONDS : GLIDE_SECONDS
      const tl = gsap.timeline()
      timeline.current = tl
      // gsap ticks on requestAnimationFrame, which stops in a hidden tab: enter on a timer as well.
      fallback.current = window.setTimeout(go, (seconds + 0.8) * 1000)
      if (!stillOnly) stage.hold('gate')
      const pieces = overlay.current ? [...overlay.current.querySelectorAll(FADING)] : []
      tl.to(pieces, { opacity: 0, duration: stillOnly ? seconds : OVERLAY_FADE_SECONDS, ease: 'power2.out' }, 0)
      tl.call(go, undefined, seconds)
    },
    [navigate, stillOnly, overlay],
  )
}

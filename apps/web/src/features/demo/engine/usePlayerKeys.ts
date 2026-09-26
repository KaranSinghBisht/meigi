import { useCallback, useEffect, type KeyboardEvent } from 'react'
import type { DemoClock } from './clock'

type Variant = 'full' | 'embed'

/** Space (or K) plays or pauses; the arrows move by chapter, or by step with reduced motion; C toggles captions. */
function useKeyAction(clock: DemoClock, reduced: boolean, toggleCaptions: () => void) {
  return useCallback(
    (key: string): boolean => {
      const { chapter, playing } = clock.getSnapshot()
      if (key === ' ' || key === 'k') {
        clock.setPlaying(!playing)
      } else if (key === 'ArrowRight') {
        if (reduced) clock.step(1)
        else clock.jumpToChapter(chapter + 1)
      } else if (key === 'ArrowLeft') {
        if (reduced) clock.step(-1)
        else clock.jumpToChapter(Math.max(chapter - 1, 0))
      } else if (key === 'c') {
        toggleCaptions()
      } else {
        return false
      }
      return true
    },
    [clock, reduced, toggleCaptions],
  )
}

/**
 * On /demo the keys work anywhere on the page (except in a text field); embedded, only while the player itself
 * has focus, so the page around it keeps its keys. Returns the embed's keydown handler.
 */
export function usePlayerKeys(clock: DemoClock, variant: Variant, reduced: boolean, toggleCaptions: () => void) {
  const act = useKeyAction(clock, reduced, toggleCaptions)

  useEffect(() => {
    if (variant !== 'full') return
    const listener = (event: globalThis.KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')
      if (!typing && !event.metaKey && !event.ctrlKey && act(event.key)) event.preventDefault()
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [variant, act])

  return (event: KeyboardEvent<HTMLElement>) => {
    if (variant === 'embed' && event.target === event.currentTarget && act(event.key)) event.preventDefault()
  }
}

/** /demo?t=64 starts at 1:04, and &paused holds it there: for screenshots and for recording from a chapter. */
export function startFromUrl(variant: Variant): { readonly at: number; readonly paused: boolean } {
  if (variant !== 'full') return { at: 0, paused: false }
  const params = new URLSearchParams(window.location.search)
  const at = Number(params.get('t') ?? '0')
  return { at: Number.isFinite(at) && at > 0 ? at : 0, paused: params.has('paused') }
}

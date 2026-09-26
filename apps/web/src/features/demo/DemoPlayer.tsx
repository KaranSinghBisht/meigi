import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import { usePrefersReducedMotion } from '../../ui/stage/usePrefersReducedMotion'
import { SCRIPT } from './chapters'
import { Captions } from './controls/Captions'
import { Controls, type Variant } from './controls/Controls'
import { DemoClock } from './engine/clock'
import { useDemoTimeline } from './engine/useDemoTimeline'
import { useJapaneseFont, usePlayerLifecycle, usePortrait } from './engine/usePlayerLifecycle'
import { DESIGN, Stage } from './stage/Stage'
import './demo.css'

/** /demo?t=64 starts at 1:04, and &paused holds it there: for screenshots and for recording from a chapter. */
function startFromUrl(variant: Variant): { readonly at: number; readonly paused: boolean } {
  if (variant !== 'full') return { at: 0, paused: false }
  const params = new URLSearchParams(window.location.search)
  const at = Number(params.get('t') ?? '0')
  return { at: Number.isFinite(at) && at > 0 ? at : 0, paused: params.has('paused') }
}

/** Space plays or pauses; the arrows move by chapter (or by step, with reduced motion); C toggles captions. */
function useKeys(clock: DemoClock, reduced: boolean, toggleCaptions: () => void) {
  return useCallback(
    (key: string): boolean => {
      const { chapter, playing } = clock.getSnapshot()
      if (key === ' ' || key === 'k') clock.setPlaying(!playing)
      else if (key === 'ArrowRight') reduced ? clock.step(1) : clock.jumpToChapter(chapter + 1)
      else if (key === 'ArrowLeft') reduced ? clock.step(-1) : clock.jumpToChapter(Math.max(chapter - 1, 0))
      else if (key === 'c') toggleCaptions()
      else return false
      return true
    },
    [clock, reduced, toggleCaptions],
  )
}

interface DemoPlayerProps {
  /** "full" is the /demo page (keys work anywhere); "embed" sits inside a page (keys work when focused). */
  readonly variant?: Variant
}

/** The recorded demo: a mail client, the Meigi agent beside it and the chain deciding, on one clock. */
export function DemoPlayer({ variant = 'embed' }: DemoPlayerProps) {
  const reduced = usePrefersReducedMotion()
  const portrait = usePortrait()
  const [clock] = useState(() => {
    const start = startFromUrl(variant)
    return new DemoClock(SCRIPT, !reduced && !start.paused, start.at)
  })
  const snap = useSyncExternalStore(clock.subscribe, clock.getSnapshot)
  const rootRef = useRef<HTMLDivElement>(null)
  const designRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [captionsOn, setCaptionsOn] = useState(true)
  const toggleCaptions = useCallback(() => setCaptionsOn((on) => !on), [])
  const onPanelHover = useCallback((hovering: boolean) => clock.hold('hover', hovering), [clock])
  const mode = portrait ? 'portrait' : 'landscape'

  useJapaneseFont()
  usePlayerLifecycle(clock, rootRef, reduced)
  useDemoTimeline({ stageRef: designRef, clock, script: SCRIPT, designWidth: DESIGN[mode].width, portrait, onError: setError })
  const onKey = useKeys(clock, reduced, toggleCaptions)

  useEffect(() => {
    if (variant !== 'full') return
    const listener = (event: globalThis.KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]')
      if (!typing && !event.metaKey && !event.ctrlKey && onKey(event.key)) event.preventDefault()
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [variant, onKey])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (variant === 'embed' && event.target === event.currentTarget && onKey(event.key)) event.preventDefault()
  }

  return (
    <div
      ref={rootRef}
      className={`dplayer dplayer--${variant} dplayer--${mode}`}
      data-reduced={reduced ? '' : undefined}
      tabIndex={variant === 'embed' ? 0 : -1}
      aria-label="Meigi demo: an AI accounts-payable agent, a bank-change scam, and the chain refusing it"
      aria-roledescription="demo player"
      onKeyDown={onKeyDown}
    >
      {error ? (
        <p className="dplayer__error" role="alert">
          The demo player couldn’t start: {error}
        </p>
      ) : (
        <Stage mode={mode} designRef={designRef} onPanelHover={onPanelHover} />
      )}
      {captionsOn ? <Captions script={SCRIPT} index={snap.caption} announce={reduced} /> : null}
      <Controls
        clock={clock}
        snap={snap}
        script={SCRIPT}
        reduced={reduced}
        variant={variant}
        captionsOn={captionsOn}
        onCaptions={toggleCaptions}
      />
    </div>
  )
}

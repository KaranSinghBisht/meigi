import { useCallback, useRef, useState, useSyncExternalStore } from 'react'
import { usePrefersReducedMotion } from '../../ui/stage/usePrefersReducedMotion'
import { SCRIPT } from './chapters'
import { Captions } from './controls/Captions'
import { Controls, type Variant } from './controls/Controls'
import { DemoClock, type ClockSnapshot } from './engine/clock'
import { useDemoTimeline } from './engine/useDemoTimeline'
import { startFromUrl, usePlayerKeys } from './engine/usePlayerKeys'
import { useJapaneseFont, usePlayerLifecycle, usePortrait } from './engine/usePlayerLifecycle'
import { DESIGN, Stage } from './stage/Stage'
import './demo.css'

interface FooterProps {
  readonly clock: DemoClock
  readonly snap: ClockSnapshot
  readonly reduced: boolean
  readonly variant: Variant
  readonly captionsOn: boolean
  readonly toggleCaptions: () => void
}

/** Captions (on by default, so the video can be watched muted) and the controls under the stage. */
function Footer({ clock, snap, reduced, variant, captionsOn, toggleCaptions }: FooterProps) {
  return (
    <div className="dplayer__footer">
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
  const designWidth = DESIGN[mode].width

  useJapaneseFont()
  usePlayerLifecycle(clock, rootRef, reduced)
  useDemoTimeline({ stageRef: designRef, clock, script: SCRIPT, designWidth, portrait, onError: setError })
  const onKeyDown = usePlayerKeys(clock, variant, reduced, toggleCaptions)

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
      <Footer
        clock={clock}
        snap={snap}
        reduced={reduced}
        variant={variant}
        captionsOn={captionsOn}
        toggleCaptions={toggleCaptions}
      />
    </div>
  )
}

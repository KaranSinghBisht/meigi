import { useEffect, useRef, type MouseEvent, type RefObject } from 'react'
import { Link } from 'react-router'
import { Button } from '../../../ui/components/Button'
import { useScrollFade } from '../../../ui/components/useScrollFade'
import type { ClockSnapshot, DemoClock } from '../engine/clock'
import type { Script } from '../engine/types'
import './controls.css'

export type Variant = 'full' | 'embed'

interface ControlsProps {
  readonly clock: DemoClock
  readonly snap: ClockSnapshot
  readonly script: Script
  readonly reduced: boolean
  readonly variant: Variant
  readonly captionsOn: boolean
  readonly onCaptions: () => void
}

/** Each chapter chip fills as its chapter plays; written straight to the DOM, once per frame. */
function useChapterFill(clock: DemoClock, script: Script, list: RefObject<HTMLOListElement | null>) {
  useEffect(
    () =>
      clock.onFrame((time) => {
        const chips = list.current?.querySelectorAll<HTMLElement>('.dchip-btn')
        chips?.forEach((chip, index) => {
          const chapter = script.chapters[index]
          if (!chapter) return
          const progress = Math.min(Math.max((time - chapter.start) / chapter.duration, 0), 1)
          chip.style.setProperty('--p', progress.toFixed(4))
        })
      }),
    [clock, script, list],
  )
}

/** When the chips scroll sideways (narrow players), the current chapter's chip is brought into view. The row
 *  scrolls by itself: scrollIntoView could move the page too. */
function useCurrentChipInView(list: RefObject<HTMLOListElement | null>, chapter: number) {
  useEffect(() => {
    const row = list.current
    const chip = row?.querySelectorAll<HTMLElement>('.dchip-btn')[chapter]
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return
    const rowBox = row.getBoundingClientRect()
    const chipBox = chip.getBoundingClientRect()
    const centred = row.scrollLeft + (chipBox.left - rowBox.left) - (rowBox.width - chipBox.width) / 2
    row.scrollTo({ left: Math.max(0, centred) })
  }, [list, chapter])
}

/**
 * A control clicked with the pointer gives its focus back, so the next key pressed (Space, C, the arrows) never draws
 * a focus ring on it, in the recording or at the booth. A keyboard press (detail 0) keeps focus where it is.
 */
function dropPointerFocus(event: MouseEvent<HTMLDivElement>): void {
  if (event.detail === 0) return
  const control = event.target instanceof Element ? event.target.closest('button, a') : null
  if (control instanceof HTMLElement) control.blur()
}

function firstStepOf(script: Script, chapter: number): number {
  const caption = script.captions.find((entry) => entry.chapter === chapter)
  const index = caption ? script.captions.indexOf(caption) : 0
  return script.steps[index] ?? 0
}

async function enterFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await document.documentElement.requestFullscreen()
  } catch {
    // Full screen was refused (an iframe or a browser setting); the page is already full-bleed, so carry on.
  }
}

function Transport({ clock, snap, script, reduced }: Pick<ControlsProps, 'clock' | 'snap' | 'script' | 'reduced'>) {
  if (reduced) {
    return (
      <div className="dcontrols__transport">
        <Button variant="ghost" size="sm" onClick={() => clock.step(-1)} disabled={snap.step === 0}>
          Back
        </Button>
        <span className="dcontrols__count">
          {snap.step + 1} / {script.steps.length}
        </span>
        <Button
          variant="primary"
          size="sm"
          onClick={() => clock.step(1)}
          disabled={snap.step >= script.steps.length - 1}
        >
          Next
        </Button>
      </div>
    )
  }
  return (
    <div className="dcontrols__transport">
      <Button variant="primary" size="sm" className="dcontrols__play" onClick={() => clock.setPlaying(!snap.playing)}>
        {snap.playing ? 'Pause' : 'Play'}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          clock.seek(0)
          clock.setPlaying(true)
        }}
      >
        Replay
      </Button>
    </div>
  )
}

export function Controls({ clock, snap, script, reduced, variant, captionsOn, onCaptions }: ControlsProps) {
  const list = useRef<HTMLOListElement>(null)
  useChapterFill(clock, script, list)
  useCurrentChipInView(list, snap.chapter)
  useScrollFade(list, snap.chapter)
  return (
    <div className="dcontrols" role="group" aria-label="Demo player controls" onClick={dropPointerFocus}>
      <Transport clock={clock} snap={snap} script={script} reduced={reduced} />
      <ol className="dchips scroll-fade" ref={list} aria-label="Chapters">
        {script.chapters.map((chapter, index) => (
          <li key={chapter.id}>
            <button
              type="button"
              className="dchip-btn"
              aria-current={index === snap.chapter ? 'step' : undefined}
              onClick={() => (reduced ? clock.seek(firstStepOf(script, index)) : clock.jumpToChapter(index))}
            >
              <span className="dchip-btn__n">{index}</span>
              <span className="dchip-btn__t">{chapter.title}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="dcontrols__side">
        {reduced ? null : (
          <Button variant="ghost" size="sm" onClick={() => clock.setSpeed(snap.speed === 1 ? 1.5 : 1)}>
            ×{snap.speed}
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-pressed={captionsOn} aria-label="Captions" onClick={onCaptions}>
          <span className="dcontrols__wide">{captionsOn ? 'Captions on' : 'Captions off'}</span>
          <span className="dcontrols__narrow" aria-hidden="true">
            CC
          </span>
        </Button>
        {variant === 'embed' ? (
          <Link className="btn btn--ghost btn--sm" to="/demo">
            Full screen <span aria-hidden="true">↗</span>
          </Link>
        ) : (
          <Button variant="ghost" size="sm" className="dcontrols__fullscreen" onClick={() => void enterFullscreen()}>
            Full screen
          </Button>
        )}
      </div>
    </div>
  )
}

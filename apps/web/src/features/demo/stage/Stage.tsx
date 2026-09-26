import { memo, useLayoutEffect, useRef, type RefObject } from 'react'
import { BrowserWindow } from './browser/BrowserWindow'
import { Cursor, EndCard, Flights } from './Overlays'
import { AgentPanel } from './panel/AgentPanel'
import { Phone } from './Phone'
import './stage.css'

/** The stage is laid out once at a design size and scaled to fit, like a video frame. */
export const DESIGN = {
  landscape: { width: 1280, height: 720 },
  portrait: { width: 420, height: 940 },
} as const

export type StageMode = keyof typeof DESIGN

function useFit(frameRef: RefObject<HTMLDivElement | null>, designRef: RefObject<HTMLDivElement | null>, mode: StageMode) {
  useLayoutEffect(() => {
    const frame = frameRef.current
    const design = designRef.current
    if (!frame || !design) return
    const { width, height } = DESIGN[mode]
    const fit = () => {
      const scale = Math.min(frame.clientWidth / width, frame.clientHeight / height)
      if (!Number.isFinite(scale) || scale <= 0) return
      const x = (frame.clientWidth - width * scale) / 2
      const y = (frame.clientHeight - height * scale) / 2
      design.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frameRef, designRef, mode])
}

interface StageProps {
  readonly mode: StageMode
  readonly designRef: RefObject<HTMLDivElement | null>
  /** The storyboard pauses the story while the pointer rests on the agent panel. */
  readonly onPanelHover: (hovering: boolean) => void
}

/** Everything the story animates. It never re-renders while playing: the timeline owns its inline styles. */
export const Stage = memo(function Stage({ mode, designRef, onPanelHover }: StageProps) {
  const frameRef = useRef<HTMLDivElement>(null)
  useFit(frameRef, designRef, mode)
  const { width, height } = DESIGN[mode]
  return (
    <div className="dstage" ref={frameRef}>
      <div className={`dstage__design dstage__design--${mode}`} ref={designRef} style={{ width, height }}>
        <div className="dstage__slot dstage__slot--browser" aria-hidden="true">
          <BrowserWindow />
        </div>
        <div
          className="dstage__slot dstage__slot--panel"
          aria-hidden="true"
          onPointerEnter={() => onPanelHover(true)}
          onPointerLeave={() => onPanelHover(false)}
        >
          <AgentPanel />
        </div>
        <div className="dstage__slot dstage__slot--phone" aria-hidden="true">
          <Phone />
        </div>
        <Flights />
        <EndCard />
        <Cursor />
      </div>
    </div>
  )
})

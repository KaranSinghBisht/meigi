import type { Script } from '../engine/types'

interface CaptionsProps {
  readonly script: Script
  readonly index: number
  /** Step-by-step (reduced motion): each caption is announced, since the viewer moved to it. */
  readonly announce: boolean
}

/** One line at a time in the caption bar, English with the Japanese term where it matters. */
export function Captions({ script, index, announce }: CaptionsProps) {
  const caption = script.captions[index]
  return (
    <div className="dcaptions" aria-live={announce ? 'polite' : 'off'}>
      {caption ? (
        <p key={index} className="dcaptions__line">
          {caption.text}
        </p>
      ) : null}
    </div>
  )
}

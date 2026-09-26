import type { Segment } from '../content/segments'

interface MarkedProps {
  readonly segments: readonly Segment[]
  /** Names the marks for the timeline: prefix "bec" makes data-d="bec-tNumber". */
  readonly prefix: string
}

/** Recorded text with the values the agent read wrapped in spans the timeline can light. */
export function Marked({ segments, prefix }: MarkedProps) {
  return (
    <>
      {segments.map((part, index) =>
        part.mark ? (
          <span key={index} className={`mk mk--${part.mark}`} data-d={`${prefix}-${part.mark}`}>
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}

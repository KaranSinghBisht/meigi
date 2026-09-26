import type { ReactNode } from 'react'
import './story.css'

interface StorySectionProps {
  readonly id: string
  readonly headline: string
  readonly body: string
  /** The mono tag under the text, e.g. REGISTRY [ 名義 · VERIFY ONCE ]. */
  readonly tag: string
  readonly bracket: string
  /** Art on the left and text on the right. */
  readonly reverse?: boolean
  /** The ASCII piece; decorative, so the text has to say everything it shows. */
  readonly children: ReactNode
}

/**
 * One beat of the start page's story, edge to edge with no box around it: a statement on one side, a glyph-drawn
 * animation on the other, alternating down the page over a band of mist.
 */
export function StorySection({ id, headline, body, tag, bracket, reverse = false, children }: StorySectionProps) {
  return (
    <section className={reverse ? 'story story--reverse' : 'story'} aria-labelledby={id}>
      <div className="story__text">
        <h2 id={id} className="story__headline">
          {headline}
        </h2>
        <p className="story__body">{body}</p>
        <p className="story__tag">
          {tag} <span className="story__bracket">[ {bracket} ]</span>
        </p>
      </div>
      <div className="story__art">{children}</div>
    </section>
  )
}

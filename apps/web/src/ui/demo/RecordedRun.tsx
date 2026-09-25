import type { ReactNode } from 'react'
import { formatJst } from '../../lib/chain/format'
import { Badge } from '../components/Badge'
import './demo.css'

interface RecordedRunProps {
  readonly title: string
  readonly recordedAt: Date
  readonly children: ReactNode
}

/** A real run, replayed from its recorded data. Clearly labelled: nothing inside is live. */
export function RecordedRun({ title, recordedAt, children }: RecordedRunProps) {
  return (
    <section className="recorded" aria-label={`Recorded run: ${title}`}>
      <header className="recorded__head">
        <Badge tone="info">Recorded run</Badge>
        <p className="recorded__title">{title}</p>
        <p className="recorded__when">{formatJst(recordedAt)} · Sepolia · replayed from real data, not live</p>
      </header>
      <div className="recorded__body">{children}</div>
    </section>
  )
}

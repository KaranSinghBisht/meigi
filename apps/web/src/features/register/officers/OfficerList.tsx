import { shortHash } from '../../../lib/chain/format'
import { Badge } from '../../../ui/components/Badge'
import './officers.css'

/** An enrolled officer: a World ID session, or a seeded demo company's placeholder that no one can prove. */
export interface OfficerEntry {
  readonly id: string
  readonly proof: 'world-id' | 'placeholder'
  /** Self Check's z-score, if that's the credential this officer proved with; null for any other credential
   * (or a placeholder). A risk signal from World, not a uniqueness verdict — shown as a quiet fact. */
  readonly sybilScore?: number | null
}

export function OfficerList({ officers }: { readonly officers: readonly OfficerEntry[] }) {
  if (officers.length === 0) return null
  return (
    <ol className="officer-list" aria-label="Enrolled officers">
      {officers.map((officer, index) => (
        <li key={officer.id} className="officer-list__item">
          <span className="officer-list__name">Officer {index + 1}</span>
          <span className="mono" title={officer.id}>
            {shortHash(officer.id)}
          </span>
          {officer.proof === 'world-id' ? (
            <Badge tone="active">Verified human</Badge>
          ) : (
            <Badge tone="neutral">Placeholder officer</Badge>
          )}
          {officer.sybilScore != null ? (
            <span className="muted" title="A risk signal from World, not a uniqueness verdict.">
              Selfie Check · sybil score {officer.sybilScore}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

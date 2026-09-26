import { shortHash } from '../../../lib/chain/format'
import { Badge } from '../../../ui/components/Badge'
import './officers.css'

/** An enrolled officer: a World ID session, or a seeded demo company's placeholder that no one can prove. */
export interface OfficerEntry {
  readonly id: string
  readonly proof: 'world-id' | 'placeholder'
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
        </li>
      ))}
    </ol>
  )
}

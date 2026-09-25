import type { Screening } from '../../../lib/api/agentTypes'
import { shortAddress } from '../../../lib/chain/format'
import { Badge } from '../../../ui/components/Badge'
import { Column } from './Column'

export function ScreeningColumn({ screening }: { readonly screening: Screening }) {
  if (screening.status === 'unavailable') {
    return (
      <Column step={4} title="Screening" tag="Intercepta" tone="muted">
        <p className="col__unavailable">Screening unavailable.</p>
        <p className="col__note">{screening.reason}</p>
      </Column>
    )
  }
  const flagged = screening.results.some((result) => result.flagged)
  const status = <Badge tone={flagged ? 'disputed' : 'active'}>{flagged ? 'Flagged' : 'Clear'}</Badge>
  return (
    <Column step={4} title="Screening" tag="Intercepta, advisory" tone={flagged ? 'hold' : 'ok'} status={status}>
      {screening.results.length === 0 ? <p className="col__note">No addresses to screen.</p> : null}
      <ul className="screen">
        {screening.results.map((result) => (
          <li key={result.address} className={result.flagged ? 'screen__item is-flagged' : 'screen__item'}>
            <span className="mono" title={result.address}>
              {shortAddress(result.address)}
            </span>
            <span className="screen__score">toxic {result.toxicScore}</span>
            {result.traits.length > 0 ? (
              <span className="screen__traits">{result.traits.slice(0, 3).join(', ')}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {screening.errors.length > 0 ? <p className="col__note">Not screened: {screening.errors.join('; ')}</p> : null}
      <p className="col__note">A clean score never overrides the registry.</p>
    </Column>
  )
}

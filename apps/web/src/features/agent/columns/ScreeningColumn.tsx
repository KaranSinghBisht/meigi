import type { Screening } from '../../../lib/api/agentTypes'
import { shortAddress } from '../../../lib/chain/format'
import { Badge } from '../../../ui/components/Badge'
import { Column } from './Column'

interface ScreeningColumnProps {
  readonly screening: Screening
  /** The verdict holds because screening couldn't answer (screening_unavailable). */
  readonly holds: boolean
}

/**
 * Without a key, screening is advisory and simply off. With one, an address that couldn't be screened holds the
 * payment (a verified human may release it). Whether it held is the verdict's call: an older agent (and the
 * recorded run) also said "unavailable" for a missing key, which held nothing.
 */
export function ScreeningColumn({ screening, holds }: ScreeningColumnProps) {
  if (screening.status === 'not_configured') {
    return (
      <Column step={4} title="Screening" tag="Intercepta" tone="muted">
        <p className="col__unavailable">Screening not configured.</p>
        <p className="col__note">{screening.reason}</p>
      </Column>
    )
  }
  if (screening.status === 'unavailable') {
    const status = holds ? <Badge tone="disputed">Hold</Badge> : undefined
    return (
      <Column step={4} title="Screening" tag="Intercepta" tone={holds ? 'hold' : 'muted'} status={status}>
        <p className="col__unavailable">Screening unavailable.</p>
        <p className="col__note">
          {screening.reason}
          {holds ? '. Nothing is auto-cleared until it answers.' : ''}
        </p>
      </Column>
    )
  }
  const flagged = screening.results.some((result) => result.flagged)
  const status = <Badge tone={flagged ? 'disputed' : 'active'}>{flagged ? 'Flagged' : 'Clear'}</Badge>
  return (
    <Column step={4} title="Screening" tag="Intercepta" tone={flagged ? 'hold' : 'ok'} status={status}>
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
      <p className="col__note">
        {flagged
          ? 'A flagged address holds the payment: no approval or force can release it.'
          : 'A clean score never overrides the registry.'}
      </p>
    </Column>
  )
}

import type { Triage } from '../../../lib/api/agentTypes'
import { Badge } from '../../../ui/components/Badge'
import { Bar, Column } from './Column'

const REQUEST_TYPES: Record<string, string> = {
  routine_invoice: 'Routine invoice',
  payee_change: 'Payee change',
  urgent_exec_request: 'Urgent exec request',
  credit_note: 'Credit note',
  other: 'Other',
}

// The agent's auto-clear thresholds (services/agent/src/triage/triage.ts DEFAULT_THRESHOLDS).
const MAX_SIGNAL = 0.2
const MAX_SUSPICION = 1

type TriageOk = Extract<Triage, { status: 'ok' }>

function TriageBars({ triage }: { readonly triage: TriageOk }) {
  const { requestType, newDestination, pressure, suspicion, pSafe, minPSafe } = triage
  return (
    <>
      {pSafe !== null ? (
        <Bar
          label={minPSafe !== null ? `P(safe), needs ${minPSafe.toFixed(2)}` : 'P(safe)'}
          value={pSafe}
          display={pSafe.toFixed(2)}
          danger={minPSafe !== null && pSafe < minPSafe}
        />
      ) : null}
      <Bar
        label={REQUEST_TYPES[requestType.value] ?? requestType.value}
        value={requestType.confidence}
        display={`${Math.round(requestType.confidence * 100)}%`}
        danger={requestType.value !== 'routine_invoice'}
      />
      <Bar
        label="New destination"
        value={newDestination}
        display={newDestination.toFixed(2)}
        danger={newDestination > MAX_SIGNAL}
      />
      <Bar label="Pressure" value={pressure} display={pressure.toFixed(2)} danger={pressure > MAX_SIGNAL} />
      <Bar
        label={`Suspicion${suspicion.level ? `: ${suspicion.level}` : ''}`}
        value={suspicion.score}
        max={3}
        display={`${suspicion.score.toFixed(1)} / 3`}
        danger={suspicion.score > MAX_SUSPICION}
      />
    </>
  )
}

export function TriageColumn({ triage }: { readonly triage: Triage }) {
  if (triage.status === 'unavailable') {
    return (
      <Column step={2} title="System-1 triage" tag="fast calibrated model" tone="muted">
        <p className="col__unavailable">Triage unavailable, so nothing can be auto-cleared.</p>
        {triage.attempts.length > 0 ? <p className="col__note">{triage.attempts.join(' · ')}</p> : null}
      </Column>
    )
  }
  const hold = triage.route === 'hold'
  const status = <Badge tone={hold ? 'disputed' : 'active'}>{hold ? 'Hold' : 'Auto-clear'}</Badge>
  const tag = `${triage.model ?? triage.backend} · ${triage.latencyMs} ms`
  return (
    <Column step={2} title="System-1 triage" tag={tag} tone={hold ? 'hold' : 'ok'} status={status}>
      <TriageBars triage={triage} />
      {triage.holdReasons.length > 0 ? (
        <ul className="col__list">
          {triage.holdReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </Column>
  )
}

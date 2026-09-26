import type { ScenarioStep } from '../../lib/api/merchant'
import { Address, TxLink } from '../../ui/components/Address'
import { Notice } from '../../ui/components/Notice'
import { InterceptaScreen } from './InterceptaScreen'
import './x402.css'

/** Whether the merchant's declared ens agrees with the registry - independent views that must match. */
function ensNote(step: ScenarioStep): string | null {
  const ens = step.declared?.ens
  if (!ens) return null
  if (!step.resolvedEns) return `${ens} didn't resolve`
  const agrees = step.registryPayout !== null && step.resolvedEns.toLowerCase() === step.registryPayout.toLowerCase()
  return agrees ? `${ens} agrees with the registry` : `${ens} disagrees with the registry`
}

function Declared({ step }: { readonly step: ScenarioStep }) {
  if (!step.declared) return <p className="step-card__declared muted">No Meigi declaration</p>
  const note = ensNote(step)
  return (
    <p className="step-card__declared">
      <span className="mono">{step.declared.tNumber}</span>
      {note ? <span className="step-card__note"> · {note}</span> : null}
    </p>
  )
}

/** One step of the research agent's run: what it saw, and what it decided. Shown live or replayed. */
export function StepCard({ step, recorded = false }: { readonly step: ScenarioStep; readonly recorded?: boolean }) {
  return (
    <div className="step-card">
      <p className="step-card__label">{step.label}</p>
      <Declared step={step} />
      {step.payTo ? (
        <p className="step-card__payto">
          payTo <Address value={step.payTo} short />
        </p>
      ) : null}
      {step.screening ? <InterceptaScreen {...step.screening} /> : null}
      <Notice
        quiet={recorded}
        tone={step.outcome === 'settled' ? 'success' : 'denied'}
        title={step.outcome === 'settled' ? 'Signed and settled.' : 'Refused before signing.'}
      >
        {step.outcome === 'refused' && step.reason ? <p>{step.reason}</p> : null}
        {step.txHash ? (
          <p>
            Settlement <TxLink hash={step.txHash} />
          </p>
        ) : null}
      </Notice>
    </div>
  )
}

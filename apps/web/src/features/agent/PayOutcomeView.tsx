import type { Analysis, PayOutcome } from '../../lib/api/agentTypes'
import { shortAddress } from '../../lib/chain/format'
import { TxLink } from '../../ui/components/Address'
import { Notice } from '../../ui/components/Notice'
import { Refusal } from './Refusal'
import './agent.css'

interface PayOutcomeViewProps {
  readonly outcome: PayOutcome
  readonly analysis: Analysis
}

export function PayOutcomeView({ outcome, analysis }: PayOutcomeViewProps) {
  if (outcome.status === 'reverted') return <Refusal outcome={outcome} analysis={analysis} />
  if (outcome.status === 'held') {
    return (
      <Notice tone="warn" title="Held. The kernel sent nothing.">
        <p>{outcome.explanation.text}</p>
        {outcome.reasons.length > 0 ? (
          <ul className="held__reasons">
            {outcome.reasons.slice(0, 4).map((reason, index) => (
              <li key={`${reason.code}-${index}`}>{reason.message}</li>
            ))}
          </ul>
        ) : null}
        <p>Press “Let the agent pay anyway” to skip the kernel and ask the chain directly.</p>
      </Notice>
    )
  }
  const payee = analysis.kernel.payee
  return (
    <section className="paid" role="status">
      <p className="paid__kicker">
        {outcome.forced ? 'Forced, and the chain still only paid the registered company' : 'Paid'}
      </p>
      <p className="paid__title">
        {outcome.amount} to{' '}
        {payee?.legalName ? (
          <span className="jp" lang="ja">
            {payee.legalName}
          </span>
        ) : (
          'the registered payee'
        )}
      </p>
      <p className="paid__meta">
        at <span className="mono">{shortAddress(outcome.payTo)}</span>, its registered payout ·{' '}
        <TxLink hash={outcome.txHash} />
      </p>
    </section>
  )
}

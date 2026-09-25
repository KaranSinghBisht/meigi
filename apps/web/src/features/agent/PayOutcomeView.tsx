import type { Analysis, PayOutcome } from '../../lib/api/agentTypes'
import { shortAddress } from '../../lib/chain/format'
import { TxLink } from '../../ui/components/Address'
import { Button } from '../../ui/components/Button'
import { Notice } from '../../ui/components/Notice'
import { Refusal } from './Refusal'
import './agent.css'

type Paid = Extract<PayOutcome, { status: 'paid' }>
type Held = Extract<PayOutcome, { status: 'held' }>

interface PaidViewProps {
  readonly outcome: Paid
  readonly analysis: Analysis
  readonly approved: boolean
}

function kicker(outcome: Paid, approved: boolean): string {
  if (approved) return 'Approved by a verified human, then paid'
  return outcome.forced ? 'Forced, and the chain still only paid the registered company' : 'Paid'
}

function PaidView({ outcome, analysis, approved }: PaidViewProps) {
  const payee = analysis.kernel.payee
  return (
    <section className="paid" role="status">
      <p className="paid__kicker">{kicker(outcome, approved)}</p>
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

/** `shown` is the explanation already on screen in the decision bar; it isn't repeated. */
function HeldView({ outcome, shown }: { readonly outcome: Held; readonly shown: string }) {
  const refused = outcome.reasons.some((reason) => reason.code === 'force_refused')
  const explanation = outcome.explanation.text !== shown ? outcome.explanation.text : null
  return (
    <Notice tone="warn" title={refused ? 'Held, and forcing it is refused.' : 'Held. The kernel sent nothing.'}>
      {explanation ? <p>{explanation}</p> : null}
      {outcome.reasons.length > 0 ? (
        <ul className="held__reasons">
          {outcome.reasons.slice(0, 4).map((reason, index) => (
            <li key={`${reason.code}-${index}`}>{reason.message}</li>
          ))}
        </ul>
      ) : null}
      {refused ? null : (
        <p>The attack demo, “Let the agent pay anyway”, skips the kernel and asks the chain directly.</p>
      )}
    </Notice>
  )
}

interface PayOutcomeViewProps {
  readonly outcome: PayOutcome
  readonly analysis: Analysis
  /** Paid with a verified human's approval (World ID for Agents). */
  readonly approved?: boolean
  /** Asks the agent again; for a sent payment that had no receipt yet, this settles it without resending. */
  readonly onCheckAgain: () => void
}

export function PayOutcomeView({ outcome, analysis, approved = false, onCheckAgain }: PayOutcomeViewProps) {
  if (outcome.status === 'reverted') return <Refusal outcome={outcome} analysis={analysis} />
  if (outcome.status === 'held') return <HeldView outcome={outcome} shown={analysis.explanation.text} />
  if (outcome.status === 'paid') return <PaidView outcome={outcome} analysis={analysis} approved={approved} />
  return (
    <Notice
      tone="info"
      title="Sent to Sepolia, waiting for the receipt."
      action={
        <Button size="sm" variant="ghost" onClick={onCheckAgain}>
          Check again
        </Button>
      }
    >
      <p>
        {outcome.message} Transaction <TxLink hash={outcome.txHash} />
      </p>
    </Notice>
  )
}

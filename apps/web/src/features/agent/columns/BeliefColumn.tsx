import type { Proposal } from '../../../lib/api/agentTypes'
import { shortAddress } from '../../../lib/chain/format'
import { Column } from './Column'

function yen(amount: string | null): string {
  if (!amount) return 'an unknown amount'
  const value = Number(amount)
  return Number.isFinite(value) ? `¥${value.toLocaleString('en-US')}` : amount
}

/** The LLM's proposal, quoted: it is shown, never trusted. */
export function BeliefColumn({ proposal }: { readonly proposal: Proposal }) {
  if (proposal.status === 'unavailable') {
    return (
      <Column step={5} title="The agent believes" tag={`LLM · ${proposal.provider}`} tone="muted">
        <p className="col__unavailable">No proposal from the LLM.</p>
        <p className="col__note">{proposal.message}</p>
      </Column>
    )
  }
  return (
    <Column
      step={5}
      title="The agent believes"
      tag={`only proposes · ${proposal.model || proposal.provider}`}
      tone="belief"
    >
      <blockquote className="belief">
        <p>“{proposal.reasoning || 'No reasoning given.'}”</p>
      </blockquote>
      <p className={proposal.wouldPay ? 'belief__wants is-yes' : 'belief__wants'}>
        {proposal.wouldPay ? 'Wants to pay ' : 'Would not pay '}
        <strong>{yen(proposal.amount)}</strong>
        {proposal.payTo ? (
          <>
            {' to '}
            <span className="mono" title={proposal.payTo}>
              {shortAddress(proposal.payTo)}
            </span>
          </>
        ) : null}
      </p>
    </Column>
  )
}

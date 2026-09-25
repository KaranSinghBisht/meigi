import { useEffect, useRef } from 'react'
import type { Analysis, PayOutcome } from '../../lib/api/agentTypes'
import { shortAddress } from '../../lib/chain/format'
import { prefersReducedMotion } from '../../lib/hooks/motion'
import { HankoMark } from '../../ui/brand/HankoMark'
import './refusal.css'

type Reverted = Extract<PayOutcome, { status: 'reverted' }>

function Mismatch({ outcome, analysis }: { readonly outcome: Reverted; readonly analysis: Analysis }) {
  const { tNumber, expected, registered } = outcome.error.args
  const legalName = analysis.kernel.payee?.legalName
  const tDisplay = tNumber ? `T${tNumber.replace(/^T/i, '').padStart(13, '0')}` : analysis.kernel.payee?.tNumber
  return (
    <p className="refusal__line">
      <span className="mono">{tDisplay}</span>
      {legalName ? (
        <>
          {' = '}
          <span className="jp" lang="ja">
            {legalName}
          </span>
        </>
      ) : null}{' '}
      pays <span className="mono refusal__good">{registered ? shortAddress(registered) : 'its registered payout'}</span>
      ;
      <br />
      this invoice asked for{' '}
      <span className="mono refusal__bad">{expected ? shortAddress(expected) : 'another address'}</span>.
    </p>
  )
}

/** The big moment: the agent was fooled, the vault was not. */
export function Refusal({ outcome, analysis }: { readonly outcome: Reverted; readonly analysis: Analysis }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
    ref.current?.focus({ preventScroll: true })
  }, [])
  const mismatch = outcome.error.name === 'PayeeMismatch'
  return (
    <section ref={ref} className="refusal" role="alert" tabIndex={-1} aria-labelledby="refusal-title">
      <div className="refusal__seal" aria-hidden="true">
        <HankoMark size={120} />
      </div>
      <div className="refusal__body">
        <p className="refusal__kicker">
          AgentVault.payInvoice reverted <span className="mono">{outcome.error.name}</span>
        </p>
        <h2 id="refusal-title" className="refusal__title">
          The chain refused.
        </h2>
        {mismatch ? (
          <Mismatch outcome={outcome} analysis={analysis} />
        ) : (
          <p className="refusal__line">{outcome.error.sentence}</p>
        )}
        <p className="refusal__meta">
          {outcome.broadcast
            ? 'The transaction reverted on Sepolia.'
            : 'Simulated against Sepolia first; nothing was broadcast, nothing moved.'}
          {outcome.explanation.source === 'llm' && outcome.explanation.text ? ` ${outcome.explanation.text}` : ''}
        </p>
      </div>
    </section>
  )
}

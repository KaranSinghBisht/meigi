import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../../lib/hooks/motion'
import { ErrorNotice } from '../../ui/components/Notice'
import { Spinner } from '../../ui/components/Spinner'
import { AnalysisColumns } from './AnalysisColumns'
import { DecisionBar } from './DecisionBar'
import { PayOutcomeView } from './PayOutcomeView'
import { TokenForm } from './TokenForm'
import type { AgentConsole } from './useAgentConsole'
import './agent.css'

/** Brings fresh results into view: on a projector they would otherwise land below the fold. */
function useRevealOnReady(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ready) ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [ready])
  return ref
}

export function Results({ agent }: { readonly agent: AgentConsole }) {
  const { analysis, pay } = agent
  const ref = useRevealOnReady(analysis.kind === 'ready')
  if (analysis.kind === 'idle') return null
  if (analysis.kind === 'analyzing') {
    return (
      <p className="agent__working">
        <Spinner /> Extracting, triaging, asking the LLM, screening and checking the chain…
      </p>
    )
  }
  if (analysis.kind === 'failed') {
    return (
      <>
        <ErrorNotice error={analysis.error} />
        {analysis.error.code === 'unauthorized' ? <TokenForm onSaved={() => void agent.analyze()} /> : null}
      </>
    )
  }
  return (
    <div ref={ref} className="agent__results">
      <h2 className="sr-only">What each stage found</h2>
      <AnalysisColumns analysis={analysis.analysis} />
      <DecisionBar analysis={analysis.analysis} controls={{ pay, onPay: (force) => void agent.submitPayment(force) }} />
      {pay.kind === 'done' ? (
        <PayOutcomeView
          outcome={pay.outcome}
          analysis={analysis.analysis}
          onCheckAgain={() => void agent.submitPayment(pay.force)}
        />
      ) : null}
      {pay.kind === 'failed' ? <ErrorNotice error={pay.error} /> : null}
      {pay.kind === 'failed' && pay.error.code === 'unauthorized' ? (
        <TokenForm onSaved={() => void agent.submitPayment(pay.force)} />
      ) : null}
    </div>
  )
}

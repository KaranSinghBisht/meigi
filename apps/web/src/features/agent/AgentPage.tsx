import { useEffect, useRef } from 'react'
import { unavailable } from '../../lib/api/messages'
import { prefersReducedMotion } from '../../lib/hooks/motion'
import { ErrorNotice } from '../../ui/components/Notice'
import { Spinner } from '../../ui/components/Spinner'
import { AnalysisColumns } from './AnalysisColumns'
import { DecisionBar } from './DecisionBar'
import { InvoiceInput } from './InvoiceInput'
import { PayOutcomeView } from './PayOutcomeView'
import { TokenForm } from './TokenForm'
import { useAgentConsole, type AgentConsole } from './useAgentConsole'
import { VaultStrip } from './VaultStrip'
import './agent.css'

/** Brings fresh results into view: on a projector they would otherwise land below the fold. */
function useRevealOnReady(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ready) ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [ready])
  return ref
}

function Results({ agent }: { readonly agent: AgentConsole }) {
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
      <DecisionBar analysis={analysis.analysis} pay={pay} onPay={(force) => void agent.submitPayment(force)} />
      {pay.kind === 'done' ? <PayOutcomeView outcome={pay.outcome} analysis={analysis.analysis} /> : null}
      {pay.kind === 'failed' ? <ErrorNotice error={pay.error} /> : null}
      {pay.kind === 'failed' && pay.error.code === 'unauthorized' ? (
        <TokenForm onSaved={() => void agent.submitPayment(pay.force)} />
      ) : null}
    </div>
  )
}

function AgentOffline() {
  const offline = unavailable('agent')
  return <ErrorNotice error={{ ...offline, detail: `${offline.detail} The examples below are built in until then.` }} />
}

export default function AgentPage() {
  const agent = useAgentConsole()
  return (
    <div className="agent">
      <header className="agent__head">
        <div>
          <p className="eyebrow">AP agent console</p>
          <h1 className="agent__title">Please try to rob our AI accountant.</h1>
          <p className="agent__lede">
            It pays our suppliers in JPYC from an AgentVault. Paste a fake invoice, a bank-change email or a prompt
            injection. The agent may believe it. The chain decides.
          </p>
        </div>
        <VaultStrip version={agent.payments} />
      </header>
      {agent.examples.offline ? <AgentOffline /> : null}
      <InvoiceInput agent={agent} />
      <Results agent={agent} />
    </div>
  )
}

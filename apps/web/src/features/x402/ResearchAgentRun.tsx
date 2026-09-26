import { useState } from 'react'
import { runResearchAgent, type ScenarioResult } from '../../lib/api/merchant'
import { explainError, type Explained } from '../../lib/api/messages'
import { Button } from '../../ui/components/Button'
import { ErrorNotice } from '../../ui/components/Notice'
import { Panel } from '../../ui/components/Panel'
import { useSceneMood } from '../../ui/stage/useSceneMood'
import { StepCard } from './StepCard'
import './x402.css'

type RunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly result: ScenarioResult }
  | { readonly status: 'failed'; readonly error: Explained }

function Summary({ result }: { readonly result: ScenarioResult }) {
  useSceneMood(result.settledCount > 0 ? 'ok' : null)
  return (
    <p className="agent-run__summary">
      {result.settledCount} settled, {result.refusedCount} refused before signing.
    </p>
  )
}

/** A research agent buying 2 GPU-minutes and a dataset slice for a job, live against the local x402 demo. */
export function ResearchAgentRun() {
  const [state, setState] = useState<RunState>({ status: 'idle' })

  const run = async () => {
    setState({ status: 'running' })
    try {
      setState({ status: 'done', result: await runResearchAgent() })
    } catch (error) {
      setState({ status: 'failed', error: explainError(error, 'merchant') })
    }
  }

  return (
    <Panel
      title="A research agent, shopping for a job"
      eyebrow="2 GPU-minutes + a dataset slice"
      className="agent-run"
    >
      <p className="agent-run__lede">
        It needs compute and data for a job, and finds more than one source for each. Watch it check every 402
        against the registry and ENS before it signs anything.
      </p>
      <div className="form-actions">
        <Button size="lg" busy={state.status === 'running'} onClick={() => void run()}>
          {state.status === 'running' ? 'Shopping…' : 'Run the research agent'}
        </Button>
      </div>
      {state.status === 'failed' ? <ErrorNotice error={state.error} /> : null}
      {state.status === 'done' ? (
        <>
          <Summary result={state.result} />
          <div className="agent-run__steps">
            {state.result.steps.map((step, index) => (
              <StepCard key={`${step.path}-${index}`} step={step} />
            ))}
          </div>
        </>
      ) : null}
    </Panel>
  )
}

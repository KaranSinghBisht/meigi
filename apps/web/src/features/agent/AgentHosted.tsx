import { DemoMachine } from '../../ui/demo/DemoMachine'
import { RecordedRun } from '../../ui/demo/RecordedRun'
import { AnalysisColumns } from './AnalysisColumns'
import { ApprovalExplainer } from './approval/ApprovalExplainer'
import { DecisionBar } from './DecisionBar'
import { RECORDED_BEC } from './recorded'
import { Refusal } from './Refusal'
import { VaultStrip } from './VaultStrip'
import './agent.css'

/** The public site: the agent itself runs on the demo machine, so this replays a real run instead. */
export function AgentHosted() {
  const run = RECORDED_BEC
  return (
    <div className="agent__hosted">
      <VaultStrip version={0} />
      <DemoMachine
        service="agent"
        what="Reading invoices and paying suppliers"
        why="it holds the AgentVault's agent key"
      />
      <RecordedRun title="A bank-change email. The agent believed it; the chain refused." recordedAt={run.recordedAt}>
        <details className="recorded__doc">
          <summary>The email the agent read</summary>
          <pre className="codeblock">{run.document}</pre>
        </details>
        <AnalysisColumns analysis={run.analysis} />
        <DecisionBar analysis={run.analysis} />
        <p className="recorded__step">Then “Let the agent pay anyway”:</p>
        <Refusal outcome={run.outcome} analysis={run.analysis} live={false} />
      </RecordedRun>
      <ApprovalExplainer />
    </div>
  )
}

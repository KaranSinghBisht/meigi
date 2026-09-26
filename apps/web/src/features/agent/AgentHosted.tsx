import { lazy, Suspense } from 'react'
import { Spinner } from '../../ui/components/Spinner'
import { DemoMachine } from '../../ui/demo/DemoMachine'
import { RecordedRun } from '../../ui/demo/RecordedRun'
import { ApprovalExplainer } from './approval/ApprovalExplainer'
import { RECORDED_BEC } from './recorded'
import { VaultStrip } from './VaultStrip'
import './agent.css'

// The recorded demo player (with gsap) loads only on the hosted site, where the agent itself isn't reachable.
const DemoPlayer = lazy(() => import('../demo/DemoPlayer').then((module) => ({ default: module.DemoPlayer })))

/** The public site: the agent itself runs on the demo machine, so this replays a real run instead. */
export function AgentHosted() {
  return (
    <div className="agent__hosted">
      <VaultStrip version={0} />
      <DemoMachine
        service="agent"
        what="Reading invoices and paying suppliers"
        why="it holds the AgentVault's agent key"
      />
      <RecordedRun title="The agent at work, replayed from real runs." recordedAt={RECORDED_BEC.recordedAt}>
        <Suspense fallback={<Spinner label="Loading the demo" />}>
          <DemoPlayer variant="embed" />
        </Suspense>
      </RecordedRun>
      <ApprovalExplainer />
    </div>
  )
}

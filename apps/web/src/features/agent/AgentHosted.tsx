import { lazy, Suspense } from 'react'
import { Spinner } from '../../ui/components/Spinner'
import { DemoMachine } from '../../ui/demo/DemoMachine'
import { RecordedRun } from '../../ui/demo/RecordedRun'
import { SettlementsPanel } from '../settlements/SettlementsPanel'
import { ApprovalExplainer } from './approval/ApprovalExplainer'
import { RECORDED_BEC } from './recorded'
import { VaultPanel } from './VaultPanel'
import './agent.css'

// The recorded demo player (with gsap) loads only on the hosted site, where the agent itself isn't reachable.
const DemoPlayer = lazy(() => import('../demo/DemoPlayer').then((module) => ({ default: module.DemoPlayer })))

/**
 * The public site: the agent itself runs on the demo machine, so this replays real runs instead. Laid out like the
 * live console: the note about the demo machine where the document would be, the live vault beside it.
 */
export function AgentHosted() {
  return (
    <div className="agent__hosted">
      <div className="agent-board">
        <div className="agent-board__main">
          <DemoMachine
            service="agent"
            what="Reading invoices and paying suppliers"
            why="it holds the AgentVault's agent key"
          />
        </div>
        <aside className="agent-board__side" aria-label="The vault the agent pays from">
          <VaultPanel version={0} />
        </aside>
      </div>
      <SettlementsPanel />
      <RecordedRun title="The agent at work, replayed from real runs." recordedAt={RECORDED_BEC.recordedAt}>
        <Suspense fallback={<Spinner label="Loading the demo" />}>
          <DemoPlayer variant="embed" />
        </Suspense>
      </RecordedRun>
      <ApprovalExplainer />
    </div>
  )
}

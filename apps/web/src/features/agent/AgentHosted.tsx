import { lazy, Suspense } from 'react'
import { Spinner } from '../../ui/components/Spinner'
import { RecordedRun } from '../../ui/demo/RecordedRun'
import { SettlementsPanel } from '../settlements/SettlementsPanel'
import { ApprovalExplainer } from './approval/ApprovalExplainer'
import { RECORDED_BEC } from './recorded'
import { LiveRefusalPanel } from './refusal/LiveRefusal'
import { VaultPanel } from './VaultPanel'
import './agent.css'

// The recorded demo player (with gsap) loads only on the hosted site, where the agent itself isn't reachable.
const DemoPlayer = lazy(() => import('../demo/DemoPlayer').then((module) => ({ default: module.DemoPlayer })))

/**
 * The public site: the live agent runs on our own machine (its signer holds the vault's agent key), so this replays
 * real runs.
 * Laid out like the live console, with the live vault beside the heading, which already says it is a replay.
 */
export function AgentHosted() {
  return (
    <div className="agent__hosted">
      <div className="agent-board">
        <aside className="agent-board__side" aria-label="The vault the agent pays from">
          <VaultPanel version={0} />
        </aside>
      </div>
      <LiveRefusalPanel />
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

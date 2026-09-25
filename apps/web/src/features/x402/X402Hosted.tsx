import type { DeclaredKind } from '../../lib/api/merchant'
import { Panel } from '../../ui/components/Panel'
import { DemoMachine } from '../../ui/demo/DemoMachine'
import { RecordedRun } from '../../ui/demo/RecordedRun'
import { MERCHANTS } from './merchants'
import { PurchaseResult } from './PurchaseResult'
import { RECORDED_AT, RECORDED_PURCHASES } from './recorded'
import './x402.css'

function RecordedMerchant({ kind }: { readonly kind: DeclaredKind }) {
  const copy = MERCHANTS[kind]
  return (
    <Panel title={copy.title} eyebrow={copy.eyebrow} className={`merchant merchant--${kind}`}>
      <p className="merchant__body">{copy.body}</p>
      <PurchaseResult purchase={RECORDED_PURCHASES[kind]} recorded />
    </Panel>
  )
}

/** The public site: the buyer and merchant run on the demo machine, so this replays two real purchases. */
export function X402Hosted() {
  return (
    <div className="x402__hosted">
      <DemoMachine
        service="merchant"
        what="Buying data over x402"
        why="the buyer agent and the facilitator hold funded keys"
      />
      <RecordedRun title="The guarded buyer agent, buying twice" recordedAt={RECORDED_AT}>
        <div className="x402__grid">
          <RecordedMerchant kind="honest" />
          <RecordedMerchant kind="compromised" />
        </div>
      </RecordedRun>
    </div>
  )
}

import { DemoMachine } from '../../ui/demo/DemoMachine'
import { RecordedRun } from '../../ui/demo/RecordedRun'
import { MERCHANT_LISTINGS } from './merchants'
import { MerchantCard } from './MerchantCard'
import { RECORDED_AT, RECORDED_RUN } from './recorded'
import { StepCard } from './StepCard'
import './x402.css'

/** The public site: the buyer, the merchants and the facilitator hold funded keys, so this replays one real run. */
export function X402Hosted() {
  return (
    <div className="x402__hosted">
      <DemoMachine
        service="merchant"
        what="Buying compute and data over x402"
        why="the buyer agent, the merchants and the facilitator all hold funded keys"
      />
      <div className="x402__grid cells window">
        {MERCHANT_LISTINGS.map((listing) => (
          <MerchantCard key={listing.id} listing={listing} />
        ))}
      </div>
      <RecordedRun title="A research agent, shopping for a job" recordedAt={RECORDED_AT}>
        <p className="agent-run__summary">
          {RECORDED_RUN.settledCount} settled, {RECORDED_RUN.refusedCount} refused before signing.
        </p>
        <div className="agent-run__steps">
          {RECORDED_RUN.steps.map((step, index) => (
            <StepCard key={`${step.path}-${index}`} step={step} recorded />
          ))}
        </div>
      </RecordedRun>
    </div>
  )
}

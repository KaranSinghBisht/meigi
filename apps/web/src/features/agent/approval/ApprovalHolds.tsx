import type { Reason } from '../../../lib/api/agentTypes'
import './approval.css'

/** The console's name for each hold a person may release; the agent's sentence says why it applies here. */
const LABELS: Record<string, string> = {
  triage_hold: 'Triage hold',
  triage_unavailable: 'Triage unavailable',
  pressure_hold: 'Pressure to pay fast',
  above_auto_clear_budget: 'Above the auto-clear budget',
}

/** What the approver is releasing, each hold in its own words: the World ID app screen can't show it. */
export function ApprovalHolds({ holds }: { readonly holds: readonly Reason[] }) {
  if (holds.length === 0) return null
  return (
    <div className="approval__holds">
      <p className="approval__holds-title">Approving releases these holds, and nothing else:</p>
      <ul className="approval__holds-list">
        {holds.map((hold, index) => (
          <li key={`${hold.code}-${index}`}>
            <strong>{LABELS[hold.code] ?? hold.code.replace(/_/g, ' ')}.</strong> {hold.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

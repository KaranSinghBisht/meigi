import { Panel } from '../../../ui/components/Panel'
import './approval.css'

/** The public site describes the approval flow; there is no recorded run of it yet. */
export function ApprovalExplainer() {
  return (
    <Panel
      title="A human can approve a held invoice through World ID for Agents"
      eyebrow="World ID for Agents"
      className="approval-explainer"
    >
      <ol className="approval-explainer__steps">
        <li>
          The agent holds a genuine invoice because it reads as urgent or pressured. Problems with the document itself,
          like a credit note, hidden text or two totals, can never be approved.
        </li>
        <li>
          “Ask a human to approve with World ID” opens an approval for the approver, who approves with the World ID they
          enrolled with (on a phone, by scanning its QR code). They check the short code matches and approve with a
          fresh World ID proof. A different World ID is refused, and nothing is paid.
        </li>
        <li>
          The agent then pays that one invoice, once. If the request is denied, expires, or comes from a different World
          ID than the enrolled approver, nothing is paid.
        </li>
      </ol>
      <p className="muted">
        Either way, the vault still pays only the registered payout. Approvals run live on our own machine too.
      </p>
    </Panel>
  )
}

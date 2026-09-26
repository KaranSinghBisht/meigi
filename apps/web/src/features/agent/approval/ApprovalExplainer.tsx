import { Panel } from '../../../ui/components/Panel'
import './approval.css'

/** The public site describes the approval flow; there is no recorded run of it yet. */
export function ApprovalExplainer() {
  return (
    <Panel
      title="A held invoice can be approved by a verified human"
      eyebrow="World ID for Agents"
      className="approval-explainer"
    >
      <ol className="approval-explainer__steps">
        <li>
          The agent holds a genuine invoice because it reads as urgent or pressured. Problems with the document itself,
          like a credit note, hidden text or two totals, can never be approved.
        </li>
        <li>
          “Ask a verified human to approve” shows a QR code and a short code. The approver scans it with the World ID app,
          checks the code matches, and approves with a fresh World ID proof.
        </li>
        <li>
          The agent then pays that one invoice, once. If the request is denied, expires, or comes from a different human
          than the enrolled approver, nothing is paid.
        </li>
      </ol>
      <p className="muted">
        Either way, the vault still pays only the registered payout. This runs on the Meigi demo machine too.
      </p>
    </Panel>
  )
}

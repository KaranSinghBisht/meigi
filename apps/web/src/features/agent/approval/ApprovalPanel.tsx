import type { Reason } from '../../../lib/api/agentTypes'
import { formatJstTime } from '../../../lib/chain/format'
import { HankoMark } from '../../../ui/brand/HankoMark'
import { Button } from '../../../ui/components/Button'
import { ErrorNotice, Notice } from '../../../ui/components/Notice'
import { ApprovalRequest } from './ApprovalRequest'
import type { Approval, ApprovalFlow, NotApprovedStatus } from './useApproval'
import './approval.css'

const WHY_NOT: Record<NotApprovedStatus, string> = {
  denied: 'The approver denied it in the World ID app.',
  expired: 'The request expired before anyone approved it.',
  wrong_human: 'The proof came from a different human than the enrolled approver.',
  unavailable: "World ID couldn't confirm it, and an unconfirmed request never counts as an approval.",
}

/**
 * "Expired" covers both a request nobody approved and an approval that wasn't used in time; only the agent
 * knows which, so its sentence wins there. The other outcomes keep the console's own wording.
 */
function whyNot(status: NotApprovedStatus, reason: string | null): string {
  if (status !== 'expired' || !reason) return WHY_NOT[status]
  const sentence = reason.charAt(0).toUpperCase() + reason.slice(1)
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`
}

/** Asking again can't change these answers, so no retry is offered. */
const FINAL = new Set(['not_approvable', 'approval_not_configured'])

type Approved = Extract<ApprovalFlow, { kind: 'approved' }>

function ApprovedNotice({ flow }: { readonly flow: Approved }) {
  const when = flow.approvedAt ? ` at ${formatJstTime(flow.approvedAt)}` : ''
  return (
    <Notice
      tone="success"
      title={`Approved by a verified human: fresh World ID proof${when}.`}
      action={<HankoMark size={52} glyphs="承認" tone="jade" className="approval__stamp" />}
    >
      {flow.approver === 'enrolled' ? <p>First approval: this human is now the enrolled approver.</p> : null}
      {flow.approver === 'matched' ? <p>The same human who enrolled as the approver.</p> : null}
      <p>The agent pays once with this approval, and the vault still pays only the registered payout.</p>
    </Notice>
  )
}

function Retry({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick}>
      {label}
    </Button>
  )
}

/** Where the human approval stands, under the decision bar; nothing until someone asks. */
interface ApprovalPanelProps {
  readonly approval: Approval
  readonly holds: readonly Reason[]
}

export function ApprovalPanel({ approval, holds }: ApprovalPanelProps) {
  const { flow, ask, cancel } = approval
  if (flow.kind === 'waiting') {
    return <ApprovalRequest attempt={flow.attempt} holds={holds} lostContact={flow.lostContact} onCancel={cancel} />
  }
  if (flow.kind === 'approved') return <ApprovedNotice flow={flow} />
  if (flow.kind === 'not-approved') {
    return (
      <Notice
        tone="denied"
        title="Not approved: nothing was paid."
        action={<Retry label="Ask again" onClick={() => void ask()} />}
      >
        <p>{whyNot(flow.status, flow.reason)} The invoice stays held.</p>
      </Notice>
    )
  }
  if (flow.kind === 'failed') {
    const retry = FINAL.has(flow.error.code ?? '') ? undefined : <Retry label="Try again" onClick={() => void ask()} />
    return <ErrorNotice error={flow.error} action={retry} />
  }
  return null
}

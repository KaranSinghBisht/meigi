import type { Reason } from '../../../lib/api/agentTypes'
import type { ApprovalAttempt } from '../../../lib/api/approval'
import { Button } from '../../../ui/components/Button'
import { Countdown } from '../../../ui/components/Countdown'
import { Spinner } from '../../../ui/components/Spinner'
import { useQr } from '../../../ui/world/useQr'
import { ApprovalHolds } from './ApprovalHolds'
import './approval.css'

interface ApprovalRequestProps {
  readonly attempt: ApprovalAttempt
  /** The blocking holds this approval releases. */
  readonly holds: readonly Reason[]
  readonly lostContact: boolean
  readonly onCancel: () => void
}

/** An approver whose World ID is on a phone scans this instead of opening the link here. */
function Scan({ uri }: { readonly uri: string }) {
  const qr = useQr(uri)
  return (
    <figure className="approval__scan">
      <div className="approval__qr">
        {qr.src ? <img src={qr.src} alt="QR code of this approval link" width={132} height={132} /> : null}
        {!qr.src && !qr.failed ? <Spinner /> : null}
        {qr.failed ? <p className="muted">Couldn't draw the QR code; use the link.</p> : null}
      </div>
      <figcaption className="approval__scan-caption">or scan it with the World ID you enrolled with</figcaption>
    </figure>
  )
}

/**
 * The open request: approve with the World ID you enrolled with (the link, opened here, is the primary way), the code
 * to compare, and how long it stays open. A different World ID is refused, and nothing is paid.
 */
export function ApprovalRequest({ attempt, holds, lostContact, onCancel }: ApprovalRequestProps) {
  return (
    <section className="approval" aria-labelledby="approval-title">
      <div className="approval__body">
        <p className="eyebrow">World ID for Agents</p>
        <h3 id="approval-title" className="approval__title">
          Waiting for a human to approve this payment with World ID
        </h3>
        <p className="approval__lede">Approve with the World ID you enrolled with. Nothing is paid until then.</p>
        <p className="approval__lede">A different World ID is refused, and nothing is paid.</p>
        <div className="approval__links">
          <a className="btn btn--primary btn--md" href={attempt.verificationUri} target="_blank" rel="noreferrer">
            Open on this device <span aria-hidden="true">↗</span>
          </a>
          <Button variant="quiet" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <ApprovalHolds holds={holds} />
        <div className="approval__code">
          <p className="approval__code-label">Check this code matches where you approve</p>
          <p className="approval__code-value">{attempt.userCode}</p>
        </div>
        <p className="approval__status" aria-live="polite">
          {lostContact ? null : <Spinner />}
          {lostContact ? 'Lost contact with the agent; trying again…' : 'Waiting for the approval…'}
        </p>
        <p className="approval__expiry">
          Expires in <Countdown to={attempt.expiresAt} />
        </p>
      </div>
      <Scan uri={attempt.verificationUri} />
    </section>
  )
}

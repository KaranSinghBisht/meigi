import type { Reason } from '../../../lib/api/agentTypes'
import type { ApprovalAttempt } from '../../../lib/api/approval'
import { Button } from '../../../ui/components/Button'
import { Countdown } from '../../../ui/components/Countdown'
import { Spinner } from '../../../ui/components/Spinner'
import { useQr } from '../../../ui/world/useQr'
import { ApprovalHolds } from './ApprovalHolds'
import './approval.css'

/** The IdP's sandbox is approved from the World ID Sandbox app; production from the World ID app. */
function appName(uri: string): string {
  return new URL(uri).hostname.includes('sandbox') ? 'the World ID Sandbox app' : 'the World ID app'
}

interface ApprovalRequestProps {
  readonly attempt: ApprovalAttempt
  /** The blocking holds this approval releases. */
  readonly holds: readonly Reason[]
  readonly lostContact: boolean
  readonly onCancel: () => void
}

/** The open request: a QR code of the approval link, the code to compare, and how long it stays open. */
export function ApprovalRequest({ attempt, holds, lostContact, onCancel }: ApprovalRequestProps) {
  const qr = useQr(attempt.verificationUri)
  const app = appName(attempt.verificationUri)
  return (
    <section className="approval" aria-labelledby="approval-title">
      <div className="approval__qr">
        {qr.src ? (
          <img src={qr.src} alt={`QR code that opens this approval in ${app}`} width={188} height={188} />
        ) : null}
        {!qr.src && !qr.failed ? <Spinner /> : null}
        {qr.failed ? <p className="muted">Couldn't draw the QR code; use the link.</p> : null}
      </div>
      <div className="approval__body">
        <p className="eyebrow">World ID for Agents</p>
        <h3 id="approval-title" className="approval__title">
          Waiting for a human to approve this payment with World ID
        </h3>
        <p className="approval__lede">
          Scan with {app}, then approve with a fresh World ID proof. Nothing is paid until then.
        </p>
        <ApprovalHolds holds={holds} />
        <div className="approval__code">
          <p className="approval__code-label">Check this code matches in {app}</p>
          <p className="approval__code-value">{attempt.userCode}</p>
        </div>
        <p className="approval__status" aria-live="polite">
          {lostContact ? null : <Spinner />}
          {lostContact ? 'Lost contact with the agent; trying again…' : 'Waiting for the approval…'}
        </p>
        <p className="approval__expiry">
          Expires in <Countdown to={attempt.expiresAt} />
        </p>
        <div className="approval__links">
          <a className="btn btn--ghost btn--sm" href={attempt.verificationUri} target="_blank" rel="noreferrer">
            Open on this device <span aria-hidden="true">↗</span>
          </a>
          <Button variant="quiet" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </section>
  )
}

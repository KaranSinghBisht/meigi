import { shortHash } from '../../lib/chain/format'
import { Countdown } from '../../ui/components/Countdown'
import { ErrorNotice, Notice } from '../../ui/components/Notice'
import { CredentialNote } from '../../ui/world/CredentialNote'
import { WorldIdProof } from '../../ui/world/WorldIdProof'
import type { IntentFlow } from './useIntent'
import './change.css'

const ACTION_LABELS: Record<string, string> = {
  PayoutChange: 'Change the payout address',
  ControllerRotation: 'Replace the business key',
  CancelPayoutChange: 'Cancel the pending payout change',
  CancelRotation: 'Cancel the pending key rotation',
}

function OfficerRows({ flow }: { readonly flow: IntentFlow }) {
  const intent = flow.intent
  if (!intent) return null
  if (intent.sessions.length === 0) {
    return (
      <Notice tone="warn" title="This verifier has no enrolled officer sessions for this company.">
        <p>Officers enroll with World ID during registration; only those sessions can approve changes.</p>
      </Notice>
    )
  }
  return (
    <ol className="approvals">
      {intent.sessions.map((session, index) => {
        const done = flow.proved.includes(session.officerId)
        return (
          <li key={session.officerId} className={done ? 'approvals__row is-done' : 'approvals__row'}>
            <span className="approvals__who">
              <span className="approvals__name">Officer {index + 1}</span>
              <span className="mono" title={session.officerId}>
                {shortHash(session.officerId)}
              </span>
              {session.sybilScore !== null ? (
                <span className="muted" title="A risk signal from World, not a uniqueness verdict.">
                  Selfie Check · sybil score {session.sybilScore}
                </span>
              ) : null}
            </span>
            {done ? (
              <span className="approvals__ok">✓ approved with World ID</span>
            ) : (
              <WorldIdProof
                label="Approve with World ID"
                signal={intent.signal}
                sessionId={session.sessionId}
                initialContext={index === 0 ? intent.rpContext : undefined}
                onProof={(result) => flow.approve(result, session.officerId)}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** The officers prove their enrolled World ID sessions against this request's signal. */
export function Approvals({ flow }: { readonly flow: IntentFlow }) {
  const intent = flow.intent
  const request = flow.request
  if (!intent || !request) return null
  const approvals = flow.phase.kind === 'collecting' ? flow.phase.approvals : intent.threshold
  return (
    <div className="change__step">
      <div className="approvals__head">
        <p>
          <strong>{ACTION_LABELS[request.action] ?? request.action}</strong> for{' '}
          <span className="mono">{request.tNumber}</span>
        </p>
        <p className="approvals__meta">
          <span>
            {approvals} of {intent.threshold} approvals
          </span>
          <span>
            expires in <Countdown to={new Date(intent.deadline * 1000)} />
          </span>
        </p>
      </div>
      <OfficerRows flow={flow} />
      <CredentialNote />
      {flow.error ? <ErrorNotice error={flow.error} /> : null}
      <div className="approvals__impostor">
        <p className="muted">
          Try it: someone who isn't an enrolled officer proves with their own World ID. The verifier checks it is the
          same human who enrolled.
        </p>
        <WorldIdProof
          label="Someone else tries to approve"
          signal={intent.signal}
          onProof={(result) => flow.approve(result, null)}
          variant="ghost"
        />
      </div>
    </div>
  )
}

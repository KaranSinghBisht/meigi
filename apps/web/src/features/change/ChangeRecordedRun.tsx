import { shortHash } from '../../lib/chain/format'
import { TxLink } from '../../ui/components/Address'
import { Notice } from '../../ui/components/Notice'
import { RecordedRun } from '../../ui/demo/RecordedRun'
import type { RecordedChangeRun } from './recorded'
import './change.css'

/** One officer row, replayed: every officer here proved, since the run it replays completed. */
function OfficerRow({
  officerId,
  sessionId,
  sybilScore,
  index,
}: {
  readonly officerId: string
  readonly sessionId: string
  readonly sybilScore: number | null
  readonly index: number
}) {
  return (
    <li className="approvals__row is-done">
      <span className="approvals__who">
        <span className="approvals__name">Officer {index + 1}</span>
        <span className="mono" title={sessionId}>
          {shortHash(officerId)}
        </span>
        {sybilScore !== null ? (
          <span className="muted" title="A risk signal from World, not a uniqueness verdict.">
            Selfie Check · sybil score {sybilScore}
          </span>
        ) : null}
      </span>
      <span className="approvals__ok">✓ approved with World ID</span>
    </li>
  )
}

/**
 * `/change`, replayed from one real production run (World ID, Selfie Check): the request, the officer
 * quorum's World ID proofs, the queued payout change with its 72h public window, and a second human refused.
 * Nothing here is live; every id, message and tx hash is exactly what the real run produced.
 */
export function ChangeRecordedRun({ run }: { readonly run: RecordedChangeRun }) {
  return (
    <RecordedRun title={`A real payout-change approval for ${run.tNumber}`} recordedAt={new Date(run.recordedAt)}>
      <p className="agent-run__summary">
        {run.legalName} ({run.tNumber}) requested a new payout address, approved by a quorum of the officers who
        enrolled with World ID.
      </p>
      <ol className="approvals">
        {run.officers.map((officer, index) => (
          <OfficerRow
            key={officer.officerId}
            officerId={officer.officerId}
            sessionId={officer.sessionId}
            sybilScore={officer.sybilScore}
            index={index}
          />
        ))}
      </ol>
      <Notice tone="success" title={`Approved by ${run.provedOfficerIds.length} of ${run.threshold} officers`}>
        <p>Quorum reached. The attester signed the officers' approval; the business key queued it on-chain.</p>
      </Notice>
      <Notice tone="success" title={`Queued on-chain. It lands in ${run.changeDelayHours} hours unless cancelled.`}>
        <p>
          Transaction <TxLink hash={run.queueTxHash} />. The registry shows the countdown but never the new address
          until it lands.
        </p>
      </Notice>
      <div className="approvals__impostor">
        <p className="muted">A second person, not an enrolled officer, tried to approve the same request:</p>
        <Notice tone="danger" title="Refused">
          <p>{run.impostorRefusal}</p>
        </Notice>
      </div>
    </RecordedRun>
  )
}

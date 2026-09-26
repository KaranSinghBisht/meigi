import type { IDKitResultSession } from '@worldcoin/idkit'
import { useState } from 'react'
import { explainError, type Explained } from '../../lib/api/messages'
import { enrollOfficer, type Registration } from '../../lib/api/verifier'
import { shortHash } from '../../lib/chain/format'
import { Button } from '../../ui/components/Button'
import { ErrorNotice, Notice } from '../../ui/components/Notice'
import { CredentialNote } from '../../ui/world/CredentialNote'
import { WorldIdProof } from '../../ui/world/WorldIdProof'
import './register.css'

function OfficerList({ officers }: { readonly officers: readonly string[] }) {
  if (officers.length === 0) return <p className="muted">No officers enrolled yet.</p>
  return (
    <ol className="officers" aria-label="Enrolled officers">
      {officers.map((officerId, index) => (
        <li key={officerId} className="officers__item">
          <span className="officers__index">Officer {index + 1}</span>
          <span className="mono" title={officerId}>
            {shortHash(officerId)}
          </span>
          <span className="officers__ok">✓ World ID session</span>
        </li>
      ))}
    </ol>
  )
}

/** Sends one officer's World ID session proof; a refusal is shown here and fails the widget. */
function useEnroll(registration: Registration, onEnrolled: (officerId: string) => void) {
  const [error, setError] = useState<Explained | null>(null)
  const [enrolled, setEnrolled] = useState(false)
  const enroll = async (result: IDKitResultSession) => {
    setError(null)
    try {
      onEnrolled((await enrollOfficer(registration.id, result)).officerId)
      setEnrolled(true)
    } catch (reason) {
      setError(explainError(reason, 'verifier'))
      throw reason
    }
  }
  return { error, enrolled, enroll }
}

interface OfficersStepProps {
  readonly registration: Registration
  readonly officers: readonly string[]
  readonly onEnrolled: (officerId: string) => void
  readonly onContinue: () => void
}

export function OfficersStep({ registration, officers, onEnrolled, onContinue }: OfficersStepProps) {
  const { error, enrolled, enroll } = useEnroll(registration, onEnrolled)
  const none = officers.length === 0
  return (
    <div className="step">
      <p className="step__lede">
        Each officer proves they are a unique human with World ID. The proof creates a World ID <em>session</em> bound
        to this registration; later, every change must be approved by that same session, so only the same humans can
        move money.
      </p>
      <CredentialNote />
      <OfficerList officers={officers} />
      {enrolled ? <Notice tone="success" title="Officer enrolled." /> : null}
      {error ? <ErrorNotice error={error} /> : null}
      <div className="form-actions">
        <WorldIdProof
          label={none ? 'Enroll an officer with World ID' : 'Enroll another officer'}
          signal={registration.enrollmentSignal}
          onProof={enroll}
          variant={none ? 'primary' : 'ghost'}
          size="lg"
        />
        <Button size="lg" variant={none ? 'ghost' : 'primary'} disabled={none} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  )
}

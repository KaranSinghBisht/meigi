import type { IDKitResultSession } from '@worldcoin/idkit'
import { useState } from 'react'
import { explainError, type Explained } from '../../../lib/api/messages'
import { enrollOfficer, type Registration } from '../../../lib/api/verifier'
import { shortHash } from '../../../lib/chain/format'
import { Badge } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { ErrorNotice, Notice } from '../../../ui/components/Notice'
import { CredentialNote } from '../../../ui/world/CredentialNote'
import { WorldIdProof } from '../../../ui/world/WorldIdProof'
import type { Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import './officers.css'

function OfficerList({ officers }: { readonly officers: readonly string[] }) {
  if (officers.length === 0) return null
  return (
    <ol className="officer-list" aria-label="Enrolled officers">
      {officers.map((officerId, index) => (
        <li key={officerId} className="officer-list__item">
          <span className="officer-list__name">Officer {index + 1}</span>
          <span className="mono" title={officerId}>
            {shortHash(officerId)}
          </span>
          <Badge tone="active">Verified human</Badge>
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

export function OfficersStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const { registration, officers } = onboarding.state
  if (!registration) return null
  return <Officers onboarding={onboarding} registration={registration} officers={officers} />
}

interface OfficersProps {
  readonly onboarding: Onboarding
  readonly registration: Registration
  readonly officers: readonly string[]
}

function Officers({ onboarding, registration, officers }: OfficersProps) {
  const { error, enrolled, enroll } = useEnroll(registration, onboarding.officerAdded)
  const none = officers.length === 0
  return (
    <StepFrame
      step={3}
      title="Who approves changes?"
      lede="Every future payout change needs one of these same people."
      actions={
        <StepActions onBack={() => onboarding.goTo(2)}>
          <Button size="lg" disabled={none} onClick={() => onboarding.goTo(4)}>
            Continue
          </Button>
        </StepActions>
      }
    >
      <CredentialNote />
      <OfficerList officers={officers} />
      {enrolled ? <Notice tone="success" title="Officer added." /> : null}
      {error ? <ErrorNotice error={error} /> : null}
      <div className="officer-add">
        <WorldIdProof
          label={none ? 'Add an officer with World ID' : 'Add another officer'}
          signal={registration.enrollmentSignal}
          onProof={enroll}
          variant={none ? 'primary' : 'ghost'}
          size="lg"
        />
      </div>
    </StepFrame>
  )
}

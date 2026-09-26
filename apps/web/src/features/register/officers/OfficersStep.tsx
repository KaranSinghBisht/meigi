import type { IDKitResultSession } from '@worldcoin/idkit'
import { useState } from 'react'
import type { Explained } from '../../../lib/api/messages'
import { enrollOfficer, type Registration } from '../../../lib/api/verifier'
import { Button } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import { CredentialNote } from '../../../ui/world/CredentialNote'
import { WorldIdProof } from '../../../ui/world/WorldIdProof'
import { COPY } from '../flow/copy'
import { explainStep } from '../flow/errors'
import { STEP } from '../flow/steps'
import type { Onboarding } from '../flow/useOnboarding'
import { StepError } from '../wizard/StepError'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { OfficerList } from './OfficerList'
import './officers.css'

/** The registry's cap on officers per company (the verifier refuses a ninth with too_many_officers). */
const MAX_OFFICERS = 8

/** Sends one officer's World ID session proof; a refusal is shown here and fails the widget.
 * `sybilScores` is kept only in this component: the shared onboarding state tracks officer ids alone, and this
 * is display-only (a risk signal, never gated on), so it doesn't need to live anywhere more durable. */
function useEnroll(registration: Registration, onEnrolled: Onboarding['officerAdded']) {
  const [error, setError] = useState<Explained | null>(null)
  const [enrolled, setEnrolled] = useState(false)
  const [sybilScores, setSybilScores] = useState<Record<string, number | null>>({})
  const enroll = async (result: IDKitResultSession) => {
    setError(null)
    try {
      const enrollment = await enrollOfficer(registration.id, result)
      onEnrolled(registration.id, enrollment.officerId)
      setSybilScores((prev) => ({ ...prev, [enrollment.officerId]: enrollment.sybilScore }))
      setEnrolled(true)
    } catch (reason) {
      setError(explainStep(reason))
      throw reason
    }
  }
  return { error, enrolled, enroll, sybilScores }
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
  const { error, enrolled, enroll, sybilScores } = useEnroll(registration, onboarding.officerAdded)
  const none = officers.length === 0
  return (
    <StepFrame
      step={STEP.officers}
      title={COPY.officers.title}
      lede={COPY.officers.lede}
      actions={
        <StepActions onBack={() => onboarding.goTo(STEP.representative)}>
          <Button size="lg" disabled={none} onClick={() => onboarding.goTo(STEP.review)}>
            Continue
          </Button>
        </StepActions>
      }
    >
      <CredentialNote />
      <OfficerList
        officers={officers.map((id) => ({ id, proof: 'world-id' as const, sybilScore: sybilScores[id] ?? null }))}
      />
      {enrolled ? <Notice tone="success" title="Officer added." /> : null}
      {error ? <StepError error={error} onboarding={onboarding} /> : null}
      {officers.length >= MAX_OFFICERS ? (
        <p className="officer-full">A company can have at most {MAX_OFFICERS} officers.</p>
      ) : (
        <div className="officer-add">
          <WorldIdProof
            label={none ? 'Add an officer with World ID' : 'Add another officer'}
            signal={registration.enrollmentSignal}
            consequence="added"
            onProof={enroll}
            variant={none ? 'primary' : 'ghost'}
            size="lg"
          />
        </div>
      )}
    </StepFrame>
  )
}

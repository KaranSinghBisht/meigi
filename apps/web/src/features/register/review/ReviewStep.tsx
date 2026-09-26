import { useState } from 'react'
import type { Explained } from '../../../lib/api/messages'
import { submitRegistration, type Registration } from '../../../lib/api/verifier'
import { Button } from '../../../ui/components/Button'
import { COPY } from '../flow/copy'
import { explainStep } from '../flow/errors'
import { STEP } from '../flow/steps'
import type { Onboarding } from '../flow/useOnboarding'
import { StepError } from '../wizard/StepError'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { LookupDetails, SummaryCard, type Summary } from './SummaryCard'
import { ThresholdPicker } from './ThresholdPicker'

function useSubmit(onboarding: Onboarding, registration: Registration) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Explained | null>(null)
  const submit = async (threshold: number) => {
    setBusy(true)
    setError(null)
    try {
      onboarding.submitted(registration.id, await submitRegistration(registration.id, threshold))
    } catch (reason) {
      setError(explainStep(reason))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

/** The reader's choice, or 2 of n by default (1 with a single officer), as the registration flow always suggested. */
function thresholdOf(chosen: number | null, officers: number): number {
  return Math.min(Math.max(chosen ?? 2, 1), officers)
}

/** Answers after which submitting again can't help: the registration went through, or the number is claimed. */
const SETTLED = new Set(['already_submitted', 'already_disputed', 'already_registered'])

interface ReviewProps {
  readonly onboarding: Onboarding
  readonly registration: Registration
  readonly summary: Summary
  readonly officers: number
}

function Review({ onboarding, registration, summary, officers }: ReviewProps) {
  const { busy, error, submit } = useSubmit(onboarding, registration)
  const threshold = thresholdOf(onboarding.state.threshold, officers)
  const settled = error?.code !== undefined && SETTLED.has(error.code)
  return (
    <StepFrame
      step={STEP.review}
      title={COPY.review.title}
      lede={COPY.review.lede}
      actions={
        <StepActions onBack={busy ? undefined : () => onboarding.goTo(STEP.officers)}>
          <Button size="lg" busy={busy} disabled={settled} onClick={() => void submit(threshold)}>
            {busy ? 'Writing to the registry…' : 'Register company'}
          </Button>
        </StepActions>
      }
    >
      <SummaryCard summary={summary} />
      <LookupDetails company={summary.company} />
      <ThresholdPicker max={officers} value={threshold} onChange={onboarding.setThreshold} />
      {error ? <StepError error={error} onboarding={onboarding} /> : null}
    </StepFrame>
  )
}

export function ReviewStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const { company, registration, controller, payout, domainMethod, officers } = onboarding.state
  if (!company || !registration || !controller || !payout) return null
  const n = officers.length
  const summary: Summary = {
    company,
    legalName: registration.legalName,
    controller,
    payout,
    domain: registration.domainProof.txtName.replace(/^_meigi\./, ''),
    domainMethod,
    officers: `${n} verified ${n === 1 ? 'human' : 'humans'}`,
  }
  return <Review onboarding={onboarding} registration={registration} summary={summary} officers={n} />
}

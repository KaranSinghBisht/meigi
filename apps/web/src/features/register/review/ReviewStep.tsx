import { useState, type ReactNode } from 'react'
import { explainError, type Explained } from '../../../lib/api/messages'
import { submitRegistration, type Registration } from '../../../lib/api/verifier'
import { parseTNumber } from '../../../lib/chain/tNumber'
import type { HexAddress } from '../../../lib/env/env'
import { Address } from '../../../ui/components/Address'
import { Badge } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { ErrorNotice } from '../../../ui/components/Notice'
import type { Company, Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { ThresholdPicker } from './ThresholdPicker'
import './review.css'

interface Summary {
  readonly company: Company
  readonly registration: Registration
  readonly controller: HexAddress
  readonly payout: HexAddress
  readonly officers: number
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Everything that goes on-chain, as the registry and every ENS client will show it. */
function SummaryCard({ summary }: { readonly summary: Summary }) {
  const { company, registration, controller, payout, officers } = summary
  const ens = parseTNumber(company.tNumber)?.ens ?? ''
  const domain = registration.domainProof.txtName.replace(/^_meigi\./, '')
  return (
    <dl className="review-card onboard-cell">
      <Row label="Company">
        <span className="jp" lang="ja">
          {registration.legalName}
        </span>{' '}
        {company.fixture ? <Badge tone="info">Fictional</Badge> : <Badge tone="active">NTA exact match</Badge>}
      </Row>
      <Row label="T-number">
        <span className="mono">{company.tNumber}</span>
      </Row>
      <Row label="Payee name">
        <span className="mono">{ens}</span>
      </Row>
      <Row label="Payout address">
        <Address value={payout} copy />
      </Row>
      <Row label="Business key">
        <Address value={controller} />
      </Row>
      <Row label="Domain">
        <span className="review-domain">{domain}</span>{' '}
        {company.fixture ? <Badge tone="neutral">Not proven</Badge> : <Badge tone="active">Signed DNS record</Badge>}
      </Row>
      <Row label="Officers">
        {officers} verified {officers === 1 ? 'human' : 'humans'}
      </Row>
    </dl>
  )
}

function useSubmit(onboarding: Onboarding, registration: Registration) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Explained | null>(null)
  const submit = async (threshold: number) => {
    setBusy(true)
    setError(null)
    try {
      onboarding.submitted(await submitRegistration(registration.id, threshold))
    } catch (reason) {
      setError(explainError(reason, 'verifier'))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

function Review({ onboarding, summary }: { readonly onboarding: Onboarding; readonly summary: Summary }) {
  const { busy, error, submit } = useSubmit(onboarding, summary.registration)
  const threshold = Math.min(Math.max(onboarding.state.threshold, 1), summary.officers)
  return (
    <StepFrame
      step={4}
      title="Check everything, then register"
      lede="Meigi's attester writes this to the public registry on Sepolia. A number that's already claimed is frozen as disputed, never overwritten."
      actions={
        <StepActions onBack={busy ? undefined : () => onboarding.goTo(3)}>
          <Button size="lg" busy={busy} onClick={() => void submit(threshold)}>
            {busy ? 'Writing to the registry…' : 'Register company'}
          </Button>
        </StepActions>
      }
    >
      <SummaryCard summary={summary} />
      <ThresholdPicker max={summary.officers} value={threshold} onChange={onboarding.setThreshold} />
      {error ? <ErrorNotice error={error} /> : null}
    </StepFrame>
  )
}

export function ReviewStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const { company, registration, controller, payout, officers } = onboarding.state
  if (!company || !registration || !controller || !payout) return null
  const summary = { company, registration, controller, payout, officers: officers.length }
  return <Review onboarding={onboarding} summary={summary} />
}

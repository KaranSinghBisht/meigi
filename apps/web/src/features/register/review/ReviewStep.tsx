import { useState, type ReactNode } from 'react'
import type { Explained } from '../../../lib/api/messages'
import { submitRegistration, type Registration } from '../../../lib/api/verifier'
import { parseTNumber } from '../../../lib/chain/tNumber'
import type { HexAddress } from '../../../lib/env/env'
import { Address } from '../../../ui/components/Address'
import { Badge, type BadgeTone } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { explainStep } from '../flow/errors'
import type { Company, Onboarding } from '../flow/useOnboarding'
import { StepError } from '../wizard/StartOver'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { ThresholdPicker } from './ThresholdPicker'
import './review.css'

interface Summary {
  readonly company: Company
  readonly registration: Registration
  readonly controller: HexAddress
  readonly payout: HexAddress
  readonly domainMethod: string | null
  readonly officers: number
}

/** How the verifier accepted the domain, as the chip beside it says. */
const PROOF: Record<string, { tone: BadgeTone; label: string }> = {
  dns: { tone: 'active', label: 'Signed DNS record' },
  'well-known': { tone: 'active', label: 'Signed .well-known file' },
  fixture: { tone: 'neutral', label: 'Not proven' },
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function CompanyRows({ company, legalName }: { readonly company: Company; readonly legalName: string }) {
  return (
    <>
      <Row label="Company">
        <span className="review-company">
          <span className="jp" lang="ja">
            {legalName}
          </span>
          {company.address ? (
            <span className="review-company__address" lang="ja">
              {company.address}
            </span>
          ) : null}
        </span>
        {company.fixture ? <Badge tone="info">Fictional</Badge> : <Badge tone="active">NTA exact match</Badge>}
      </Row>
      <Row label="T-number">
        <span className="mono">{company.tNumber}</span>
      </Row>
      {company.lei ? (
        <Row label="LEI">
          <span className="mono">{company.lei}</span>
        </Row>
      ) : null}
      <Row label="Payee name">
        <span className="mono">{parseTNumber(company.tNumber)?.ens ?? ''}</span>
      </Row>
    </>
  )
}

/** Everything that goes on-chain, as the registry and every ENS client will show it. */
function SummaryCard({ summary }: { readonly summary: Summary }) {
  const { company, registration, controller, payout, domainMethod, officers } = summary
  const domain = registration.domainProof.txtName.replace(/^_meigi\./, '')
  const proof = PROOF[domainMethod ?? '']
  return (
    <dl className="review-card onboard-cell">
      <CompanyRows company={company} legalName={registration.legalName} />
      <Row label="Payout address">
        <Address value={payout} copy />
      </Row>
      <Row label="Business key">
        <Address value={controller} />
      </Row>
      <Row label="Domain">
        <span className="review-domain">{domain}</span>
        {proof ? <Badge tone={proof.tone}>{proof.label}</Badge> : null}
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

function Review({ onboarding, summary }: { readonly onboarding: Onboarding; readonly summary: Summary }) {
  const { busy, error, submit } = useSubmit(onboarding, summary.registration)
  const threshold = thresholdOf(onboarding.state.threshold, summary.officers)
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
      {error ? <StepError error={error} onReset={onboarding.reset} /> : null}
    </StepFrame>
  )
}

export function ReviewStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const { company, registration, controller, payout, domainMethod, officers } = onboarding.state
  if (!company || !registration || !controller || !payout) return null
  const summary = { company, registration, controller, payout, domainMethod, officers: officers.length }
  return <Review onboarding={onboarding} summary={summary} />
}

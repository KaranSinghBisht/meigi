import { useEffect, useState } from 'react'
import type { Submission } from '../../../lib/api/verifier'
import { parseTNumber } from '../../../lib/chain/tNumber'
import { TxLink } from '../../../ui/components/Address'
import { Button, LinkButton } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import { COPY } from '../flow/copy'
import { STEP } from '../flow/steps'
import type { Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { RegisteredView } from './RegisteredView'
import { sharePayee, type PayeeShare, type ShareOutcome } from './sharePayee'
import './registered.css'

const SHARE_LABEL: Record<ShareOutcome, string> = {
  shared: 'Shared',
  copied: 'Link copied',
  cancelled: 'Share payee card',
  failed: "Couldn't share",
}

function ShareButton({ payee }: { readonly payee: PayeeShare }) {
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null)
  useEffect(() => {
    if (!outcome) return
    const timer = window.setTimeout(() => setOutcome(null), 2000)
    return () => window.clearTimeout(timer)
  }, [outcome])
  return (
    <Button variant="ghost" size="lg" onClick={() => void sharePayee(payee).then(setOutcome)} aria-live="polite">
      {outcome ? SHARE_LABEL[outcome] : 'Share payee card'}
    </Button>
  )
}

function Disputed({ submission }: { readonly submission: Submission }) {
  return (
    <StepFrame
      step={STEP.registered}
      title="This number was already claimed"
      actions={
        <StepActions>
          <LinkButton to={`/registry/${submission.tNumber}`} size="lg">
            View in the registry
          </LinkButton>
        </StepActions>
      }
    >
      <Notice tone="denied" title="Nothing was overwritten.">
        <p>
          Your claim froze the payee as disputed until governance resolves it, behind the same public delay. Transaction{' '}
          <TxLink hash={submission.txHash} />
        </p>
      </Notice>
    </StepFrame>
  )
}

export function RegisteredStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const { submission, company, registration, payout } = onboarding.state
  const parsed = submission ? parseTNumber(submission.tNumber) : null
  if (!submission || !company || !registration || !payout || !parsed) return null
  if (submission.outcome === 'disputed') return <Disputed submission={submission} />
  const legalName = registration.legalName
  const url = `${window.location.origin}/registry/${parsed.display}`
  return (
    <StepFrame
      step={STEP.registered}
      title={COPY.registered.title}
      lede={COPY.registered.lede(parsed.ens)}
      actions={
        <StepActions>
          <ShareButton payee={{ legalName, tNumber: parsed.display, ens: parsed.ens, url }} />
          <LinkButton to={`/registry/${parsed.display}`} size="lg">
            View in the registry
          </LinkButton>
        </StepActions>
      }
    >
      <RegisteredView
        legalName={legalName}
        tNumber={parsed.display}
        ens={parsed.ens}
        payout={payout}
        fixture={company.fixture}
        txHash={submission.txHash}
      />
    </StepFrame>
  )
}

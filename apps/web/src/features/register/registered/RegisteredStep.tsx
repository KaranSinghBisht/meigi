import { useEffect, useState } from 'react'
import type { Submission } from '../../../lib/api/verifier'
import { parseTNumber } from '../../../lib/chain/tNumber'
import type { HexAddress } from '../../../lib/env/env'
import { TxLink } from '../../../ui/components/Address'
import { Button, LinkButton } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import { Spinner } from '../../../ui/components/Spinner'
import { STEP } from '../flow/steps'
import type { Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { PayeeCard } from './PayeeCard'
import { sharePayee, type PayeeShare, type ShareOutcome } from './sharePayee'
import { useEnsResolves } from './useEnsResolves'
import './registered.css'

function EnsCheck({ ens, payout }: { readonly ens: string; readonly payout: HexAddress }) {
  const { state, retry } = useEnsResolves(ens, payout)
  if (state.status === 'match') {
    return (
      <p className="ens-check" role="status">
        <span className="ens-check__ok">
          <span aria-hidden="true">✓</span> Resolves in any ENS client
        </span>
        <span className="ens-check__detail">Checked live on Sepolia with a stock ENS lookup.</span>
      </p>
    )
  }
  if (state.status === 'checking' || state.status === 'pending') {
    return (
      <p className="ens-check" role="status">
        <Spinner /> {state.status === 'checking' ? 'Resolving it through ENS…' : 'Waiting for the next block to resolve…'}
      </p>
    )
  }
  const title =
    state.status === 'other'
      ? 'ENS answers with a different address.'
      : state.status === 'timeout'
        ? "ENS doesn't answer for this name yet."
        : "Couldn't reach Sepolia to check."
  return (
    <Notice tone="warn" title={title} action={<Button size="sm" variant="ghost" onClick={retry}>Check again</Button>} />
  )
}

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
      title="You're registered."
      lede={`Payers who check ${parsed.ens} will only ever pay the address below. Changing it takes your business key, your officers and 72 hours in public.`}
      actions={
        <StepActions>
          <ShareButton payee={{ legalName, tNumber: parsed.display, ens: parsed.ens, url }} />
          <LinkButton to={`/registry/${parsed.display}`} size="lg">
            View in the registry
          </LinkButton>
        </StepActions>
      }
    >
      <PayeeCard legalName={legalName} tNumber={parsed.display} ens={parsed.ens} payout={payout} fixture={company.fixture} />
      <EnsCheck ens={parsed.ens} payout={payout} />
      <p className="registered-tx">
        Registered on Sepolia in <TxLink hash={submission.txHash} />
      </p>
    </StepFrame>
  )
}

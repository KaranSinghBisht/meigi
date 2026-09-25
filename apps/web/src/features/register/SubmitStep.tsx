import { useState } from 'react'
import { Link } from 'react-router'
import { explainError, type Explained } from '../../lib/api/messages'
import { submitRegistration, type Registration, type Submission } from '../../lib/api/verifier'
import { TxLink } from '../../ui/components/Address'
import { Button } from '../../ui/components/Button'
import { ErrorNotice, Notice } from '../../ui/components/Notice'
import './register.css'

interface SubmitStepProps {
  readonly registration: Registration
  readonly officerCount: number
  readonly submission: Submission | null
  readonly onSubmitted: (submission: Submission) => void
}

function ThresholdPicker({ max, value, onChange }: { max: number; value: number; onChange: (n: number) => void }) {
  return (
    <fieldset className="threshold">
      <legend className="field__label">How many officers must approve each change?</legend>
      <div className="threshold__options">
        {Array.from({ length: max }, (_, index) => index + 1).map((n) => (
          <label key={n} className="threshold__option">
            <input type="radio" name="threshold" value={n} checked={value === n} onChange={() => onChange(n)} />
            <span>
              {n} of {max}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Outcome({ submission }: { readonly submission: Submission }) {
  if (submission.outcome === 'disputed') {
    return (
      <Notice tone="denied" title="Disputed: this T-number was already claimed.">
        <p>
          Nothing was overwritten. The payee is frozen until governance resolves the dispute, behind the same public
          delay. Transaction <TxLink hash={submission.txHash} />
        </p>
      </Notice>
    )
  }
  return (
    <Notice tone="success" title={`Registered. ${submission.tNumber} is live on Sepolia.`}>
      <p>
        Transaction <TxLink hash={submission.txHash} /> ·{' '}
        <Link to={`/registry/${submission.tNumber}`}>See it in the registry →</Link>
      </p>
    </Notice>
  )
}

export function SubmitStep({ registration, officerCount, submission, onSubmitted }: SubmitStepProps) {
  const [threshold, setThreshold] = useState(Math.min(2, officerCount))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Explained | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      onSubmitted(await submitRegistration(registration.id, threshold))
    } catch (reason) {
      setError(explainError(reason, 'verifier'))
    } finally {
      setBusy(false)
    }
  }

  if (submission) return <Outcome submission={submission} />
  return (
    <div className="step">
      <p className="step__lede">
        The Meigi attester writes{' '}
        <span className="jp" lang="ja">
          {registration.legalName}
        </span>{' '}
        to the registry on Sepolia. If someone already claimed this T-number, it files a dispute instead: a second claim
        freezes the payee, it never overwrites it.
      </p>
      <ThresholdPicker max={officerCount} value={threshold} onChange={setThreshold} />
      {error ? <ErrorNotice error={error} /> : null}
      <div className="form-actions">
        <Button size="lg" variant="accent" busy={busy} onClick={() => void submit()}>
          {busy ? 'Writing to Sepolia…' : 'Register on Sepolia'}
        </Button>
      </div>
    </div>
  )
}

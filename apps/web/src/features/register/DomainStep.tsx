import { useState } from 'react'
import type { Hex } from 'viem'
import { explainError, type Explained } from '../../lib/api/messages'
import { checkDomainProof, type Registration } from '../../lib/api/verifier'
import { describeChainError } from '../../lib/chain/errors'
import { useWallet } from '../../lib/chain/WalletContext'
import { personalSign } from '../../lib/chain/wallet'
import type { HexAddress } from '../../lib/env/env'
import { Address } from '../../ui/components/Address'
import { Button } from '../../ui/components/Button'
import { ErrorNotice, Notice } from '../../ui/components/Notice'
import { ProofRecords } from './ProofRecords'
import './register.css'

interface DomainStepProps {
  readonly registration: Registration
  readonly controller: HexAddress
  readonly signature: Hex | null
  /** A new signature, or null to sign again. */
  readonly onSigned: (signature: Hex | null) => void
  readonly onVerified: (method: string) => void
}

function SignPrompt({ registration, controller, onSigned }: Omit<DomainStepProps, 'signature' | 'onVerified'>) {
  const wallet = useWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrongAccount = wallet.account !== null && wallet.account.toLowerCase() !== controller.toLowerCase()

  const sign = async () => {
    setError(null)
    const account = wallet.account ?? (await wallet.connect())
    if (!account || !wallet.provider) return
    if (account.toLowerCase() !== controller.toLowerCase()) {
      setError('This is not the controller account for this registration. Switch accounts in your wallet.')
      return
    }
    setBusy(true)
    try {
      onSigned(await personalSign(wallet.provider, account, registration.domainProof.message))
    } catch (reason) {
      setError(describeChainError(reason).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="step__block">
      <p className="step__lede">The controller wallet signs this challenge (personal_sign, no gas):</p>
      <pre className="codeblock">{registration.domainProof.message}</pre>
      {wrongAccount ? (
        <Notice tone="warn" title="Switch accounts in your wallet.">
          <p>
            The controller for this registration is <Address value={controller} short />.
          </p>
        </Notice>
      ) : null}
      <div className="form-actions">
        <Button size="lg" busy={busy} disabled={wrongAccount} onClick={() => void sign()}>
          {wallet.account ? 'Sign with wallet' : 'Connect and sign'}
        </Button>
      </div>
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** Asks the verifier to check the published proof (or, for a fixture, to skip it). */
function useDomainCheck(id: string, onVerified: (method: string) => void) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Explained | null>(null)
  const check = async () => {
    setBusy(true)
    setError(null)
    try {
      onVerified((await checkDomainProof(id)).method)
    } catch (reason) {
      setError(explainError(reason, 'verifier'))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, check }
}

/** A fictional demo company has no domain to prove: nothing to sign, the verifier just moves on. */
function FixtureDomain({ registration, onVerified }: Pick<DomainStepProps, 'registration' | 'onVerified'>) {
  const { busy, error, check } = useDomainCheck(registration.id, onVerified)
  return (
    <div className="step">
      <Notice tone="info" title="Fictional fixture: no domain proof needed.">
        <p>Registry office 9999 is never issued, so this company has no real domain to prove and nothing to sign.</p>
      </Notice>
      {error ? <ErrorNotice error={error} /> : null}
      <div className="form-actions">
        <Button size="lg" busy={busy} onClick={() => void check()}>
          Continue
        </Button>
      </div>
    </div>
  )
}

export function DomainStep(props: DomainStepProps) {
  const { registration, signature, onVerified } = props
  const { busy, error, check } = useDomainCheck(registration.id, onVerified)
  if (registration.fixture) return <FixtureDomain registration={registration} onVerified={onVerified} />
  if (!signature) return <SignPrompt {...props} />
  return (
    <div className="step">
      <ProofRecords challenge={registration.domainProof} signature={signature} />
      {error ? <ErrorNotice error={error} /> : null}
      <div className="form-actions">
        <Button size="lg" busy={busy} onClick={() => void check()}>
          Check domain
        </Button>
        <Button variant="quiet" onClick={() => props.onSigned(null)}>
          Sign again
        </Button>
      </div>
    </div>
  )
}

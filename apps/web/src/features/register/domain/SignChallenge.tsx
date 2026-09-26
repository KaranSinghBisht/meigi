import { useState } from 'react'
import { describeChainError } from '../../../lib/chain/errors'
import { useWallet } from '../../../lib/chain/WalletContext'
import { personalSign } from '../../../lib/chain/wallet'
import type { Registration } from '../../../lib/api/verifier'
import type { HexAddress } from '../../../lib/env/env'
import { Address } from '../../../ui/components/Address'
import { Button } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'
import type { Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'

interface SignChallengeProps {
  readonly onboarding: Onboarding
  readonly registration: Registration
  readonly controller: HexAddress
  readonly domain: string
}

/** The business key signs the verifier's challenge (personal_sign: free, no transaction). */
function useSign(registration: Registration, controller: HexAddress, onSigned: Onboarding['signed']) {
  const wallet = useWallet()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrongAccount = wallet.account !== null && wallet.account.toLowerCase() !== controller.toLowerCase()

  const sign = async () => {
    setError(null)
    const account = wallet.account ?? (await wallet.connect())
    if (!account || !wallet.provider) return
    if (account.toLowerCase() !== controller.toLowerCase()) {
      setError('This is not the business key for this registration. Switch accounts in your wallet.')
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
  return { busy, error, wrongAccount, connected: wallet.account !== null, sign }
}

export function SignChallenge({ onboarding, registration, controller, domain }: SignChallengeProps) {
  const signer = useSign(registration, controller, onboarding.signed)
  return (
    <StepFrame
      step={2}
      title={`Sign the proof for ${domain}`}
      lede="Your business key signs this line. It's a free signature, not a transaction."
      actions={
        <StepActions>
          <Button size="lg" busy={signer.busy} disabled={signer.wrongAccount} onClick={() => void signer.sign()}>
            {signer.connected ? 'Sign with wallet' : 'Connect and sign'}
          </Button>
        </StepActions>
      }
    >
      <pre className="codeblock">{registration.domainProof.message}</pre>
      {signer.wrongAccount ? (
        <Notice tone="warn" title="Switch accounts in your wallet.">
          <p>
            The business key for this registration is <Address value={controller} short />.
          </p>
        </Notice>
      ) : null}
      {signer.error ? (
        <p className="field__error" role="alert">
          {signer.error}
        </p>
      ) : null}
    </StepFrame>
  )
}

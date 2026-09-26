import { useCallback, useState } from 'react'
import { getAddress, isAddress, zeroAddress } from 'viem'
import { useWallet } from '../../../lib/chain/WalletContext'
import type { HexAddress } from '../../../lib/env/env'
import { Address } from '../../../ui/components/Address'
import { Button } from '../../../ui/components/Button'
import { TextField } from '../../../ui/components/Field'
import { COPY } from '../flow/copy'
import { STEP } from '../flow/steps'
import type { Drafts, Onboarding } from '../flow/useOnboarding'
import { StepActions, StepFrame } from '../wizard/StepFrame'
import { ControllerField } from './ControllerField'
import { NewPayoutWallet } from './NewPayoutWallet'
import { PayoutChoice } from './PayoutChoice'
import { useNewPayoutWallet, type NewPayoutWallet as NewWallet } from './useNewPayoutWallet'
import './wallets.css'

/**
 * A pasted payout address, checksummed; null (with a reason) when it isn't one. The wallet made on this screen
 * whose backup isn't saved yet is refused: its key would be gone the moment the screen closes.
 */
function parsePasted(
  value: string,
  unbacked: readonly HexAddress[],
): { address: HexAddress | null; problem: string | null } {
  const trimmed = value.trim()
  if (trimmed === '') return { address: null, problem: null }
  if (!isAddress(trimmed)) {
    const mixedCase = /[a-f]/.test(trimmed) && /[A-F]/.test(trimmed)
    const problem = mixedCase ? "The checksum doesn't match: check it for a typo." : 'Enter a 0x address (42 characters).'
    return { address: null, problem }
  }
  const address = getAddress(trimmed)
  if (address === zeroAddress) return { address: null, problem: "That's the zero address." }
  if (unbacked.some((item) => getAddress(item) === address)) {
    return { address: null, problem: "That wallet was made here and its backup isn't saved, so it can't be the payout." }
  }
  return { address, problem: null }
}

function resolvePayout(drafts: Drafts, account: HexAddress | null): HexAddress | null {
  if (drafts.payoutMode === 'connected') return account
  if (drafts.payoutMode === 'paste') return parsePasted(drafts.pastedPayout, drafts.unbacked).address
  return drafts.createdPayout
}

function PastedPayout({ onboarding }: { readonly onboarding: Onboarding }) {
  const { pastedPayout: value, unbacked } = onboarding.state.drafts
  const [touched, setTouched] = useState(false)
  const { problem } = parsePasted(value, unbacked)
  return (
    <TextField
      label="Payout address"
      mono
      value={value}
      onChange={(event) => onboarding.setDrafts({ pastedPayout: event.target.value })}
      onBlur={() => setTouched(true)}
      placeholder="0x…"
      error={touched || value.trim().length >= 42 ? problem : null}
      autoComplete="off"
      spellCheck={false}
    />
  )
}

function ConnectedPayout({ account }: { readonly account: HexAddress | null }) {
  return (
    <div className="onboard-cell">
      {account ? <Address value={account} copy /> : <p className="muted">Connect your business wallet above first.</p>}
      <p className="new-wallet__note">
        The simplest setup. A separate payout wallet keeps received funds apart from the key that approves changes.
      </p>
    </div>
  )
}

interface PayoutDetailProps {
  readonly onboarding: Onboarding
  readonly account: HexAddress | null
  readonly newWallet: NewWallet
}

function PayoutDetail({ onboarding, account, newWallet }: PayoutDetailProps) {
  const { drafts } = onboarding.state
  if (drafts.payoutMode === 'paste') return <PastedPayout onboarding={onboarding} />
  if (drafts.payoutMode === 'connected') return <ConnectedPayout account={account} />
  return (
    <NewPayoutWallet
      wallet={newWallet}
      saved={drafts.createdPayout}
      onDiscard={() => onboarding.setDrafts({ createdPayout: null })}
    />
  )
}

/**
 * The new-wallet maker, held here rather than in the payout choice so switching choices never drops a key whose
 * backup isn't saved yet. A wallet counts as unbacked from the moment it is made until its file is saved.
 */
function useWalletMaker(onboarding: Onboarding) {
  const { setDrafts, setUnbacked } = onboarding
  const onCreated = useCallback((address: HexAddress) => setUnbacked(address, true), [setUnbacked])
  const onSaved = useCallback(
    (address: HexAddress) => {
      setUnbacked(address, false)
      setDrafts({ createdPayout: address })
    },
    [setDrafts, setUnbacked],
  )
  return useNewPayoutWallet({ onCreated, onSaved })
}

export function WalletsStep({ onboarding }: { readonly onboarding: Onboarding }) {
  const wallet = useWallet()
  const { drafts } = onboarding.state
  const newWallet = useWalletMaker(onboarding)
  const payout = resolvePayout(drafts, wallet.account)
  const submit = () => {
    if (wallet.account && payout) onboarding.confirmWallets(wallet.account, payout)
  }
  return (
    <StepFrame
      step={STEP.wallets}
      title={COPY.wallets.title}
      lede={COPY.wallets.lede}
      onSubmit={submit}
      actions={
        <StepActions onBack={() => onboarding.goTo(STEP.company)}>
          <Button type="submit" size="lg" disabled={!wallet.account || !payout}>
            Continue
          </Button>
        </StepActions>
      }
    >
      <section className="onboard-section" aria-labelledby="business-key-title">
        <h3 id="business-key-title" className="onboard-section__title">
          Business key
        </h3>
        <p className="onboard-section__lede">It signs your domain proof, and every change after today.</p>
        <ControllerField />
      </section>
      <section className="onboard-section" aria-labelledby="payout-title">
        <h3 id="payout-title" className="onboard-section__title">
          Payout address
        </h3>
        <p className="onboard-section__lede">The only address payers who check Meigi will send money to.</p>
        <PayoutChoice mode={drafts.payoutMode} onMode={(payoutMode) => onboarding.setDrafts({ payoutMode })} />
        <PayoutDetail onboarding={onboarding} account={wallet.account} newWallet={newWallet} />
      </section>
    </StepFrame>
  )
}

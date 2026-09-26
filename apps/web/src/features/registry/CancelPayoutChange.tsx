import { useState } from 'react'
import type { Hex } from 'viem'
import { describeChainError } from '../../lib/chain/errors'
import type { PayeeSnapshot } from '../../lib/chain/registry'
import { sendCancelPayoutChange, waitForReceipt } from '../../lib/chain/wallet'
import { useWallet } from '../../lib/chain/WalletContext'
import { Button } from '../../ui/components/Button'
import { Notice } from '../../ui/components/Notice'
import { TxLink } from '../../ui/components/Address'

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; hash: Hex } | { kind: 'failed'; message: string }

/**
 * The controller cancelling a queued payout change directly, no officer quorum involved:
 * `PayeeRegistry._requireCanceller` allows the controller, an attester or governance, and this is the
 * controller exercising that on their own. Shown only when the connected wallet is that controller.
 */
export function CancelPayoutChange({ payee, onCancelled }: { readonly payee: PayeeSnapshot; readonly onCancelled: () => void }) {
  const wallet = useWallet()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const isController = Boolean(wallet.account && payee.controller && wallet.account.toLowerCase() === payee.controller.toLowerCase())
  if (!isController) return null

  const cancel = async () => {
    const account = await wallet.ready()
    if (!account || !wallet.provider) return
    setState({ kind: 'sending' })
    try {
      const hash = await sendCancelPayoutChange(wallet.provider, account, payee.tNumber.value)
      const receipt = await waitForReceipt(hash)
      if (receipt.status !== 'success') throw new Error('reverted')
      setState({ kind: 'done', hash })
      onCancelled()
    } catch (reason) {
      const message =
        reason instanceof Error && reason.message === 'reverted' ? 'The transaction reverted.' : describeChainError(reason).message
      setState({ kind: 'failed', message })
    }
  }

  if (state.kind === 'done') {
    return (
      <Notice tone="success" title="Cancelled by the controller.">
        <p>
          Transaction <TxLink hash={state.hash} />
        </p>
      </Notice>
    )
  }
  return (
    <div className="pending__action">
      {state.kind === 'failed' ? <Notice tone="danger" title={state.message} /> : null}
      <Button variant="quiet" size="sm" busy={state.kind === 'sending'} onClick={() => void cancel()}>
        Cancel with your wallet
      </Button>
    </div>
  )
}

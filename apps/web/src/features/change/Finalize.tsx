import { useState } from 'react'
import { Link } from 'react-router'
import { getAddress, isAddress, type Hex } from 'viem'
import type { SignedApprovalWire } from '../../lib/api/verifier'
import { describeChainError } from '../../lib/chain/errors'
import type { PayeeSnapshot } from '../../lib/chain/registry'
import { sendPayoutChange, waitForReceipt } from '../../lib/chain/wallet'
import { useWallet } from '../../lib/chain/WalletContext'
import type { HexAddress } from '../../lib/env/env'
import { Address, TxLink } from '../../ui/components/Address'
import { Button } from '../../ui/components/Button'
import { Notice } from '../../ui/components/Notice'
import './change.css'

type SendState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'mining'; readonly hash: Hex }
  | { readonly kind: 'queued'; readonly hash: Hex }
  | { readonly kind: 'failed'; readonly message: string; readonly hash?: Hex }

interface FinalizeProps {
  readonly payee: PayeeSnapshot
  readonly approval: SignedApprovalWire
  readonly newPayout: HexAddress
  readonly onQueued: () => void
}

function useSend({ payee, approval, newPayout, onQueued }: FinalizeProps) {
  const wallet = useWallet()
  const [state, setState] = useState<SendState>({ kind: 'idle' })
  const send = async () => {
    const account = await wallet.ready()
    if (!account || !wallet.provider) return
    setState({ kind: 'sending' })
    let hash: Hex | undefined
    try {
      hash = await sendPayoutChange(wallet.provider, account, payee.tNumber.value, newPayout, approval)
      setState({ kind: 'mining', hash })
      const receipt = await waitForReceipt(hash)
      if (receipt.status !== 'success') throw new Error('reverted')
      setState({ kind: 'queued', hash })
      onQueued()
    } catch (reason) {
      const message =
        reason instanceof Error && reason.message === 'reverted'
          ? 'The transaction reverted.'
          : describeChainError(reason).message
      setState({ kind: 'failed', message, hash })
    }
  }
  return { state, send, wallet }
}

/** The quorum is in; only the controller's wallet can queue the change on-chain. */
export function Finalize(props: FinalizeProps) {
  const { state, send, wallet } = useSend(props)
  const controller = props.payee.controller
  const wrong = Boolean(wallet.account && controller && wallet.account.toLowerCase() !== controller.toLowerCase())
  if (state.kind === 'queued') {
    const hours = Math.round(props.payee.changeDelaySeconds / 3600)
    return (
      <Notice tone="success" title={`Queued on-chain. It lands in ${hours} hours unless cancelled.`}>
        <p>
          Transaction <TxLink hash={state.hash} />. The explorer shows the countdown but never the new address until it
          lands. <Link to={`/registry/${props.payee.tNumber.display}`}>Watch it in the registry →</Link>
        </p>
      </Notice>
    )
  }
  return (
    <div className="change__step">
      <Notice tone="success" title="Quorum reached. The attester signed the officers' approval.">
        <p>Now the business key queues it: the controller's wallet calls requestPayoutChange.</p>
      </Notice>
      {wrong && controller ? (
        <Notice tone="warn" title="This wallet is not the controller.">
          <p>
            Switch to <Address value={controller} short /> in your wallet; the registry refuses anyone else.
          </p>
        </Notice>
      ) : null}
      {state.kind === 'failed' ? (
        <Notice tone="danger" title={state.message}>
          {state.hash ? (
            <p>
              Transaction <TxLink hash={state.hash} />
            </p>
          ) : null}
        </Notice>
      ) : null}
      <div className="form-actions">
        <Button
          size="lg"
          variant="accent"
          busy={state.kind === 'sending' || state.kind === 'mining'}
          onClick={() => void send()}
        >
          {state.kind === 'mining' ? 'Waiting for Sepolia…' : 'Queue it with the controller wallet'}
        </Button>
        {state.kind === 'mining' ? <TxLink hash={state.hash} /> : null}
      </div>
    </div>
  )
}

/** The new payout the approval covers: the verifier's payload when it is an address, else what was requested. */
export function approvedPayout(payload: string | null, requested: HexAddress | undefined): HexAddress | null {
  if (payload && isAddress(payload)) return getAddress(payload)
  return requested ?? null
}

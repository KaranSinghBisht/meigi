import type { IDKitResultSession } from '@worldcoin/idkit'
import { useCallback, useState } from 'react'
import { explainError, type Explained } from '../../lib/api/messages'
import {
  approveIntent,
  openIntent,
  type ApproveOutcome,
  type Intent,
  type IntentAction,
  type SignedApprovalWire,
} from '../../lib/api/verifier'
import type { HexAddress } from '../../lib/env/env'

export type IntentPhase =
  | { readonly kind: 'none' }
  | { readonly kind: 'collecting'; readonly approvals: number }
  | { readonly kind: 'approved'; readonly approval: SignedApprovalWire; readonly payload: string | null }
  | { readonly kind: 'executed'; readonly txHash: `0x${string}` }

export interface IntentRequest {
  readonly tNumber: string
  readonly action: IntentAction
  readonly newAddress?: HexAddress
}

function phaseFor(outcome: ApproveOutcome): IntentPhase {
  if (outcome.status === 'pending') return { kind: 'collecting', approvals: outcome.approvals }
  if (outcome.status === 'approved') return { kind: 'approved', approval: outcome.approval, payload: outcome.payload }
  return { kind: 'executed', txHash: outcome.txHash }
}

interface IntentState {
  readonly request: IntentRequest | null
  readonly intent: Intent | null
  readonly phase: IntentPhase
  /** Officer ids whose proof the verifier accepted in this browser. */
  readonly proved: readonly string[]
}

const EMPTY: IntentState = { request: null, intent: null, phase: { kind: 'none' }, proved: [] }

/** One approval request: open it, collect officer proofs, and end approved (payout) or executed (the rest). */
export function useIntent() {
  const [state, setState] = useState<IntentState>(EMPTY)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<Explained | null>(null)
  const intent = state.intent

  const open = useCallback(async (request: IntentRequest) => {
    setOpening(true)
    setError(null)
    try {
      const opened = await openIntent(request)
      setState({ request, intent: opened, phase: { kind: 'collecting', approvals: 0 }, proved: [] })
    } catch (reason) {
      setError(explainError(reason, 'verifier'))
    } finally {
      setOpening(false)
    }
  }, [])

  /** Sends one officer's proof. `officerId` is null when someone who isn't enrolled tries. */
  const approve = useCallback(
    async (result: IDKitResultSession, officerId: string | null) => {
      if (!intent) return
      setError(null)
      try {
        const phase = phaseFor(await approveIntent(intent.intentId, result))
        setState((prev) => {
          const proved = officerId && !prev.proved.includes(officerId) ? [...prev.proved, officerId] : prev.proved
          return { ...prev, phase, proved }
        })
      } catch (reason) {
        setError(explainError(reason, 'verifier'))
        throw reason
      }
    },
    [intent],
  )

  const reset = useCallback(() => {
    setState(EMPTY)
    setError(null)
  }, [])

  return { ...state, opening, error, open, approve, reset }
}

export type IntentFlow = ReturnType<typeof useIntent>

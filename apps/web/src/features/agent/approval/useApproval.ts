import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  readApproval,
  startApproval,
  type ApprovalAttempt,
  type ApprovalStatus,
  type Approver,
} from '../../../lib/api/approval'
import { ApiError } from '../../../lib/api/http'
import { explainError, type Explained } from '../../../lib/api/messages'

export type NotApprovedStatus = Exclude<ApprovalStatus, 'pending' | 'approved'>

export type ApprovalFlow =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'waiting'; readonly attempt: ApprovalAttempt; readonly lostContact: boolean }
  | {
      readonly kind: 'approved'
      readonly approvalId: string
      readonly approvedAt: Date | null
      readonly approver: Approver | null
      /** Already spent on a pay attempt (say, from another tab): it pays once, so it isn't sent again. */
      readonly used: boolean
    }
  | { readonly kind: 'not-approved'; readonly status: NotApprovedStatus; readonly reason: string | null }
  | { readonly kind: 'failed'; readonly error: Explained }

type Poll = ApprovalFlow | { readonly kind: 'pending'; readonly lostContact: boolean }

/** The agent stops polling the IdP at expiry; a little later the console stops asking the agent too. */
const EXPIRY_GRACE_MS = 10_000

async function pollOnce(invoiceId: string, attempt: ApprovalAttempt, signal: AbortSignal): Promise<Poll> {
  if (Date.now() > attempt.expiresAt.getTime() + EXPIRY_GRACE_MS) {
    return { kind: 'not-approved', status: 'expired', reason: null }
  }
  try {
    const state = await readApproval(invoiceId, signal)
    if (state.status === 'pending') return { kind: 'pending', lostContact: false }
    if (state.status !== 'approved') return { kind: 'not-approved', status: state.status, reason: state.reason }
    const { approvedAt, approver, used } = state
    return { kind: 'approved', approvalId: state.attemptId ?? attempt.attemptId, approvedAt, approver, used }
  } catch (error) {
    // A dropped poll is retried: the agent keeps the attempt, and nothing is paid until the console pays.
    if (error instanceof ApiError && !error.unavailable) return { kind: 'failed', error: explainError(error, 'agent') }
    return { kind: 'pending', lostContact: true }
  }
}

/** Asks the agent where the attempt stands every `interval` until it leaves pending; approval hands over its id. */
function usePolling(
  invoiceId: string,
  attempt: ApprovalAttempt | null,
  setFlow: Dispatch<SetStateAction<ApprovalFlow>>,
  onApproved: (approvalId: string, used: boolean) => void,
) {
  const approved = useRef(onApproved)
  useEffect(() => {
    approved.current = onApproved
  }, [onApproved])
  useEffect(() => {
    if (!attempt) return
    const controller = new AbortController()
    let timer = 0
    const tick = async () => {
      const next = await pollOnce(invoiceId, attempt, controller.signal)
      if (controller.signal.aborted) return
      if (next.kind !== 'pending') {
        setFlow(next)
        if (next.kind === 'approved') approved.current(next.approvalId, next.used)
        return
      }
      setFlow({ kind: 'waiting', attempt, lostContact: next.lostContact })
      timer = window.setTimeout(() => void tick(), attempt.intervalMs)
    }
    timer = window.setTimeout(() => void tick(), attempt.intervalMs)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [invoiceId, attempt, setFlow])
}

/**
 * A verified human's approval of one held invoice (World ID for Agents). The agent binds the attempt to this
 * analysis; the console shows the code, waits, and calls `onApproved` once, which pays with the approval.
 */
export function useApproval(invoiceId: string, onApproved: (approvalId: string, used: boolean) => void) {
  const [flow, setFlow] = useState<ApprovalFlow>({ kind: 'idle' })
  const ask = useCallback(async () => {
    setFlow({ kind: 'starting' })
    try {
      setFlow({ kind: 'waiting', attempt: await startApproval(invoiceId), lostContact: false })
    } catch (error) {
      setFlow({ kind: 'failed', error: explainError(error, 'agent') })
    }
  }, [invoiceId])
  /** Stops waiting here; the attempt itself lapses at its expiry, and nothing is paid without the console. */
  const cancel = useCallback(() => setFlow({ kind: 'idle' }), [])
  usePolling(invoiceId, flow.kind === 'waiting' ? flow.attempt : null, setFlow, onApproved)
  return { flow, ask, cancel }
}

export type Approval = ReturnType<typeof useApproval>

import { useCallback, useEffect, useRef, useState } from 'react'
import { askFailure, askLedger, askStatus, type AskClosed, type AskFailure, type LedgerAnswer } from '../../lib/api/ask'

export type AskState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking'; readonly question: string }
  | { readonly kind: 'answered'; readonly question: string; readonly reply: LedgerAnswer }
  | { readonly kind: 'failed'; readonly question: string; readonly failure: AskFailure }

/**
 * One question at a time to "Ask the ledger". `shown` waits for GET /api/ask to say the feature is on (off or
 * unknown, there is no box). `closed` starts from the same answer and is set when a daily cap (everyone's, or this
 * network's) is hit mid-session, so the box greys out instead of failing each time.
 */
export function useAskLedger() {
  const [state, setState] = useState<AskState>({ kind: 'idle' })
  const [shown, setShown] = useState(false)
  const [closed, setClosed] = useState<AskClosed | null>(null)
  const inflight = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    askStatus(controller.signal).then(
      (status) => {
        setShown(status.enabled)
        setClosed(status.open ? null : 'paused')
      },
      // Unknown: no box. The settlements above still show.
      () => setShown(false),
    )
    return () => {
      controller.abort()
      inflight.current?.abort()
    }
  }, [])

  const ask = useCallback(async (question: string) => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    setState({ kind: 'asking', question })
    try {
      const reply = await askLedger(question, controller.signal)
      if (!controller.signal.aborted) setState({ kind: 'answered', question, reply })
    } catch (error) {
      if (controller.signal.aborted) return
      const failure = askFailure(error)
      if (failure === 'paused' || failure === 'ip_limited') setClosed(failure)
      setState({ kind: 'failed', question, failure })
    }
  }, [])

  return { state, shown, closed, ask }
}

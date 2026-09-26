import { useCallback, useEffect, useRef, useState } from 'react'
import { askFailure, askLedger, askOpen, type AskFailure, type LedgerAnswer } from '../../lib/api/ask'

export type AskState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'asking'; readonly question: string }
  | { readonly kind: 'answered'; readonly question: string; readonly reply: LedgerAnswer }
  | { readonly kind: 'failed'; readonly question: string; readonly failure: AskFailure }

/**
 * One question at a time to "Ask the ledger". `paused` starts from GET /api/ask and turns on when the daily cap is
 * hit mid-session, so the box greys out instead of failing each time.
 */
export function useAskLedger() {
  const [state, setState] = useState<AskState>({ kind: 'idle' })
  const [paused, setPaused] = useState(false)
  const inflight = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    askOpen(controller.signal).then(
      (open) => setPaused(!open),
      // Unknown: leave the box open; a question then says why it got no answer.
      () => undefined,
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
      if (failure === 'paused') setPaused(true)
      setState({ kind: 'failed', question, failure })
    }
  }, [])

  return { state, paused, ask }
}

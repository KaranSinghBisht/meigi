import type { RpContext } from '@worldcoin/idkit'
import { useCallback, useRef, useState } from 'react'
import { explainError } from '../../lib/api/messages'
import { fetchRpContext, type RpContextWire } from '../../lib/api/verifier'
import { asSessionId, isFresh, toIdkitRpContext, WorldConfigError, type WidgetOutcome } from '../../lib/world/rpContext'

/**
 * Starting World ID: validate the saved session id, then get a fresh RP-signed context (single-use) and
 * open the session panel. Finishing drops the context, so every attempt signs a new one.
 */
export function useWorldIdFlow(sessionId: string | undefined, initialContext: RpContextWire | undefined) {
  const [context, setContext] = useState<RpContext | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [problem, setProblem] = useState<WidgetOutcome | null>(null)
  const usedInitial = useRef(false)

  const start = useCallback(async () => {
    setProblem(null)
    if (sessionId !== undefined && asSessionId(sessionId) === null) {
      setProblem({ message: "This officer's saved World ID session id is malformed.", calm: false })
      return
    }
    setPreparing(true)
    try {
      const reuse = initialContext && !usedInitial.current && isFresh(initialContext)
      usedInitial.current = true
      setContext(toIdkitRpContext(reuse ? initialContext : await fetchRpContext()))
    } catch (error) {
      const message = error instanceof WorldConfigError ? error.message : explainError(error, 'verifier').title
      setProblem({ message, calm: false })
    } finally {
      setPreparing(false)
    }
  }, [sessionId, initialContext])

  /** Closes the panel. `reason` is shown under the button; verifier refusals are reported by the caller. */
  const finish = useCallback((reason: WidgetOutcome | null) => {
    setContext(null)
    setProblem(reason)
  }, [])

  const existing = sessionId === undefined ? undefined : (asSessionId(sessionId) ?? undefined)
  return { context, preparing, problem, existing, start, finish }
}

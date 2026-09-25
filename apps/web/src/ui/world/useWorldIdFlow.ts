import type { RpContext } from '@worldcoin/idkit'
import { useCallback, useRef, useState } from 'react'
import { explainError } from '../../lib/api/messages'
import { fetchRpContext, type RpContextWire } from '../../lib/api/verifier'
import {
  asSessionId,
  describeWidgetError,
  isFresh,
  toIdkitRpContext,
  WorldConfigError,
} from '../../lib/world/rpContext'

/**
 * Opening World ID: validate the saved session id, get a fresh RP-signed context (single-use), then open the
 * widget. Closing it drops the context so the next attempt signs a new one.
 */
export function useWorldIdFlow(sessionId: string | undefined, initialContext: RpContextWire | undefined) {
  const [context, setContext] = useState<RpContext | null>(null)
  const [open, setOpen] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const usedInitial = useRef(false)

  const start = useCallback(async () => {
    setProblem(null)
    if (sessionId !== undefined && asSessionId(sessionId) === null) {
      setProblem("This officer's saved World ID session id is malformed.")
      return
    }
    setPreparing(true)
    try {
      const reuse = initialContext && !usedInitial.current && isFresh(initialContext)
      usedInitial.current = true
      setContext(toIdkitRpContext(reuse ? initialContext : await fetchRpContext()))
      setOpen(true)
    } catch (error) {
      setProblem(error instanceof WorldConfigError ? error.message : explainError(error, 'verifier').title)
    } finally {
      setPreparing(false)
    }
  }, [sessionId, initialContext])

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) setContext(null)
  }, [])

  /**
   * Any failure closes the widget: the page then shows the reason (the caller reports host-app failures,
   * which it knows best, like "not the same human"), and a retry signs a fresh single-use context instead of
   * IDKit's own "Try again" reusing the spent one.
   */
  const onError = useCallback((code: string) => {
    if (code !== 'failed_by_host_app') setProblem(describeWidgetError(code))
    setOpen(false)
    setContext(null)
  }, [])

  const existing = sessionId === undefined ? undefined : (asSessionId(sessionId) ?? undefined)
  return { context, open, preparing, problem, existing, start, onOpenChange, onError }
}

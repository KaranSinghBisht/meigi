import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { analyzeInvoice, fetchDemoInvoices, payInvoice } from '../../lib/api/agent'
import type { Analysis, DemoInvoice, PayOutcome } from '../../lib/api/agentTypes'
import { ApiError } from '../../lib/api/http'
import { explainError, type Explained } from '../../lib/api/messages'
import { BUILT_IN_EXAMPLES } from './examples'

export type AnalysisState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'analyzing' }
  | { readonly kind: 'ready'; readonly analysis: Analysis }
  | { readonly kind: 'failed'; readonly error: Explained }

export type PayState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'paying'; readonly force: boolean }
  | { readonly kind: 'done'; readonly outcome: PayOutcome; readonly force: boolean }
  | { readonly kind: 'failed'; readonly error: Explained; readonly force: boolean }

export interface Examples {
  readonly list: readonly DemoInvoice[]
  readonly source: 'loading' | 'agent' | 'built-in'
  readonly offline: boolean
}

function useExamples(): Examples {
  const [examples, setExamples] = useState<Examples>({ list: BUILT_IN_EXAMPLES, source: 'loading', offline: false })
  useEffect(() => {
    let live = true
    fetchDemoInvoices().then(
      (list) => {
        if (live)
          setExamples(
            list.length > 0
              ? { list, source: 'agent', offline: false }
              : { list: BUILT_IN_EXAMPLES, source: 'built-in', offline: false },
          )
      },
      (error: unknown) => {
        if (live)
          setExamples({
            list: BUILT_IN_EXAMPLES,
            source: 'built-in',
            offline: error instanceof ApiError && error.unavailable,
          })
      },
    )
    return () => {
      live = false
    }
  }, [])
  return examples
}

/** Paying the current analysis. `generation` changes with the document; a late result is then dropped. */
function usePayment(analysis: AnalysisState, generation: RefObject<number>) {
  const [pay, setPay] = useState<PayState>({ kind: 'idle' })
  /** Completed payment attempts, so views of the vault know when to re-read it. */
  const [payments, setPayments] = useState(0)

  const submitPayment = useCallback(
    async (force: boolean) => {
      if (analysis.kind !== 'ready') return
      const { id } = analysis.analysis
      const current = generation.current
      setPay({ kind: 'paying', force })
      try {
        const outcome = await payInvoice(id, force)
        setPayments((count) => count + 1)
        if (generation.current === current) setPay({ kind: 'done', outcome, force })
      } catch (error) {
        if (generation.current === current) setPay({ kind: 'failed', error: explainError(error, 'agent'), force })
      }
    },
    [analysis, generation],
  )
  return { pay, setPay, payments, submitPayment }
}

export function useAgentConsole() {
  const examples = useExamples()
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<AnalysisState>({ kind: 'idle' })
  const inflight = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const { pay, setPay, payments, submitPayment } = usePayment(analysis, generation)

  const analyze = useCallback(async () => {
    if (!text.trim()) return
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    generation.current++
    setAnalysis({ kind: 'analyzing' })
    setPay({ kind: 'idle' })
    try {
      const result = await analyzeInvoice(text, controller.signal)
      if (!controller.signal.aborted) setAnalysis({ kind: 'ready', analysis: result })
    } catch (error) {
      if (!controller.signal.aborted) setAnalysis({ kind: 'failed', error: explainError(error, 'agent') })
    }
  }, [text, setPay])

  const load = useCallback(
    (example: DemoInvoice) => {
      inflight.current?.abort()
      generation.current++
      setText(example.text)
      setAnalysis({ kind: 'idle' })
      setPay({ kind: 'idle' })
    },
    [setPay],
  )

  const busy = analysis.kind === 'analyzing' || pay.kind === 'paying'
  return { examples, text, setText, analysis, pay, busy, payments, analyze, submitPayment, load }
}

export type AgentConsole = ReturnType<typeof useAgentConsole>

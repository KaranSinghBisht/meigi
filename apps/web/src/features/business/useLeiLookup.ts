import { useCallback, useEffect, useRef, useState } from 'react'
import { lookupLeiViaGleif, lookupLeiViaVerifier, parseLei, type LeiRecord } from '../../lib/api/lei'
import { explainError, type Explained } from '../../lib/api/messages'
import { useServiceStatus } from '../../lib/hooks/useServiceStatus'

export type LeiSource = 'verifier' | 'gleif'

export type LeiState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'done'; readonly record: LeiRecord; readonly source: LeiSource }
  | { readonly kind: 'failed'; readonly error: Explained }

/**
 * Looks an LEI up through the Meigi verifier when it is reachable (GLEIF plus the T-number link), otherwise at
 * GLEIF directly. Check digits are verified first, so a typo never leaves the page.
 */
export function useLeiLookup() {
  const verifier = useServiceStatus('verifier')
  const source: LeiSource = verifier === 'up' ? 'verifier' : 'gleif'
  const [state, setState] = useState<LeiState>({ kind: 'idle' })
  const inflight = useRef<AbortController | null>(null)

  useEffect(() => () => inflight.current?.abort(), [])

  const lookup = useCallback(
    async (input: string) => {
      const lei = parseLei(input)
      inflight.current?.abort()
      if (!lei) return setState({ kind: 'invalid' })
      const controller = new AbortController()
      inflight.current = controller
      setState({ kind: 'loading' })
      try {
        const find = source === 'verifier' ? lookupLeiViaVerifier : lookupLeiViaGleif
        const record = await find(lei, controller.signal)
        if (!controller.signal.aborted) setState({ kind: 'done', record, source })
      } catch (error) {
        if (!controller.signal.aborted) setState({ kind: 'failed', error: explainError(error, 'verifier') })
      }
    },
    [source],
  )

  return { state, lookup, source }
}

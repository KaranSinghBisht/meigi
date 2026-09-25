import { useCallback, useEffect, useRef, useState } from 'react'
import { describeChainError } from '../../lib/chain/errors'
import { readPayee, resolveEnsAddress, type PayeeSnapshot } from '../../lib/chain/registry'
import { parseTNumber } from '../../lib/chain/tNumber'
import type { HexAddress } from '../../lib/env/env'

export type PayeeState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      readonly payee: PayeeSnapshot
      readonly refreshing: boolean
      /** Set when the latest background re-read failed; `payee` is then the last good snapshot. */
      readonly staleError: string | null
    }
  | { readonly status: 'error'; readonly message: string }

const POLL_MS = 30_000

function failed(prev: PayeeState, message: string): PayeeState {
  return prev.status === 'ready' ? { ...prev, refreshing: false, staleError: message } : { status: 'error', message }
}

/**
 * Live payee state for a T-number ("T" + 13 digits, or null): loads, re-reads every 30 s, and ignores
 * answers that arrive after a newer request. A failed re-read keeps the last snapshot (marked stale), so
 * nothing built on it, like an approval in progress, is thrown away by one flaky RPC call.
 */
export function usePayee(tNumber: string | null) {
  const [state, setState] = useState<PayeeState>({ status: tNumber ? 'loading' : 'idle' })
  const requestId = useRef(0)

  const load = useCallback(
    async (quiet: boolean) => {
      const parsed = tNumber ? parseTNumber(tNumber) : null
      if (!parsed) return
      const id = ++requestId.current
      setState((prev) => (quiet && prev.status === 'ready' ? { ...prev, refreshing: true } : { status: 'loading' }))
      try {
        const payee = await readPayee(parsed)
        if (id === requestId.current) setState({ status: 'ready', payee, refreshing: false, staleError: null })
      } catch (error) {
        const message = describeChainError(error).message
        if (id === requestId.current) setState((prev) => failed(prev, message))
      }
    },
    [tNumber],
  )

  useEffect(() => {
    if (!tNumber) {
      requestId.current++
      setState({ status: 'idle' })
      return
    }
    void load(false)
    const timer = window.setInterval(() => void load(true), POLL_MS)
    return () => window.clearInterval(timer)
  }, [tNumber, load])

  const refresh = useCallback(() => void load(true), [load])
  return { state, refresh }
}

export type EnsCheck = 'checking' | 'match' | 'none' | 'other' | 'error'

/** What `name` resolves to through ENS, compared with `expected` (null when nothing should resolve). */
export function useEnsCheck(name: string, expected: HexAddress | null): EnsCheck {
  const [check, setCheck] = useState<EnsCheck>('checking')
  useEffect(() => {
    let live = true
    setCheck('checking')
    resolveEnsAddress(name).then(
      (address) => {
        if (!live) return
        if (!address) setCheck('none')
        else setCheck(expected && address.toLowerCase() === expected.toLowerCase() ? 'match' : 'other')
      },
      () => {
        if (live) setCheck('error')
      },
    )
    return () => {
      live = false
    }
  }, [name, expected])
  return check
}

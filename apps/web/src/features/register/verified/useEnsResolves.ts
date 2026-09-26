import { useCallback, useEffect, useState } from 'react'
import { resolveEnsAddress } from '../../../lib/chain/registry'
import type { HexAddress } from '../../../lib/env/env'

export type EnsResolution =
  | { readonly status: 'checking' }
  | { readonly status: 'match' }
  /** Not answering yet: a registration a block old may not have reached every RPC node. */
  | { readonly status: 'pending' }
  | { readonly status: 'other'; readonly address: HexAddress }
  | { readonly status: 'error' }

const RETRY_MS = 4_000
const ATTEMPTS = 15

/**
 * Resolves `name` with stock viem `getEnsAddress` on Sepolia (the universal resolver, then Meigi's resolver), as
 * any ENS client would, until it answers with `expected`. A fresh registration can take a block to show up.
 */
export function useEnsResolves(name: string, expected: HexAddress) {
  const [state, setState] = useState<EnsResolution>({ status: 'checking' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    let live = true
    let timer = 0
    const attempt = (left: number) => {
      resolveEnsAddress(name).then(
        (address) => {
          if (!live) return
          if (address && address.toLowerCase() === expected.toLowerCase()) return setState({ status: 'match' })
          if (address) return setState({ status: 'other', address })
          setState({ status: 'pending' })
          if (left > 1) timer = window.setTimeout(() => attempt(left - 1), RETRY_MS)
        },
        () => {
          if (live) setState({ status: 'error' })
        },
      )
    }
    setState({ status: 'checking' })
    attempt(ATTEMPTS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [name, expected, round])

  const retry = useCallback(() => setRound((value) => value + 1), [])
  return { state, retry }
}

import { useCallback, useRef, useState } from 'react'
import type { EnsFailure, EnsPayee } from '../lib/ens'
import { parseTNumber, type ParsedTNumber } from '../../../lib/chain/tNumber'
import { landingConfig as env } from '../lib/config'

export type ActivePayee = Extract<EnsPayee, { kind: 'active' }>

/** Why a lookup failed: the ENS module didn't load, Sepolia was unreachable, or ENS answered oddly. */
export type ResolveFailure = EnsFailure | 'load'

export type ResolveState =
  | { readonly status: 'idle' }
  | { readonly status: 'invalid' }
  | { readonly status: 'loading'; readonly target: ParsedTNumber }
  | { readonly status: 'active'; readonly target: ParsedTNumber; readonly payee: ActivePayee }
  | { readonly status: 'disputed'; readonly target: ParsedTNumber }
  | { readonly status: 'missing'; readonly target: ParsedTNumber }
  | { readonly status: 'error'; readonly target: ParsedTNumber; readonly reason: ResolveFailure }

/** Resolves the T-number's ENS name (t<digits>.payee.eth) with stock viem, as any wallet would. */
async function lookup(rpcUrl: string, target: ParsedTNumber): Promise<ResolveState> {
  let ens: typeof import('../lib/ens')
  try {
    ens = await import('../lib/ens')
  } catch (error) {
    reportError(error)
    return { status: 'error', target, reason: 'load' }
  }
  try {
    const result = await ens.resolvePayee(rpcUrl, target.ens)
    if (result.kind === 'active') return { status: 'active', target, payee: result }
    if (result.kind === 'disputed') return { status: 'disputed', target }
    return { status: 'missing', target }
  } catch (error) {
    reportError(error)
    return { status: 'error', target, reason: ens.classifyEnsError(error) }
  }
}

export function useResolver() {
  const [state, setState] = useState<ResolveState>({ status: 'idle' })
  const latest = useRef(0)

  const resolve = useCallback(async (input: string) => {
    // Every submit supersedes any lookup still in flight, including invalid ones.
    const request = ++latest.current
    const target = parseTNumber(input)
    if (!target) return setState({ status: 'invalid' })
    setState({ status: 'loading', target })
    const next = await lookup(env.registry.rpcUrl, target)
    if (request === latest.current) setState(next)
  }, [])

  const reset = useCallback(() => {
    latest.current += 1
    setState({ status: 'idle' })
  }, [])

  return { state, resolve, reset }
}

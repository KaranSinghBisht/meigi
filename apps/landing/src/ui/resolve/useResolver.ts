import { useCallback, useRef, useState } from 'react'
import type { ChainFailure, PayeeLookup } from '../../lib/chain/registry'
import { parseTNumber, type ParsedTNumber } from '../../lib/chain/tNumber'
import { env, type RegistryConfig } from '../../lib/env/env'

export type ActivePayee = Extract<PayeeLookup, { kind: 'active' }>

/** Why a lookup failed: the chain module didn't load, or the chain read failed. */
export type ResolveFailure = ChainFailure | 'load'

export type ResolveState =
  | { readonly status: 'idle' }
  | { readonly status: 'invalid' }
  | { readonly status: 'undeployed'; readonly target: ParsedTNumber }
  | { readonly status: 'loading'; readonly target: ParsedTNumber }
  | { readonly status: 'active'; readonly target: ParsedTNumber; readonly payee: ActivePayee }
  | { readonly status: 'disputed'; readonly target: ParsedTNumber; readonly changePendingUntil: Date | null }
  | { readonly status: 'missing'; readonly target: ParsedTNumber }
  | { readonly status: 'error'; readonly target: ParsedTNumber; readonly reason: ResolveFailure }

async function lookup(registry: RegistryConfig, target: ParsedTNumber): Promise<ResolveState> {
  let chain: typeof import('../../lib/chain/registry')
  try {
    chain = await import('../../lib/chain/registry')
  } catch (error) {
    reportError(error)
    return { status: 'error', target, reason: 'load' }
  }
  try {
    const result = await chain.lookupPayee(registry, target.value)
    if (result.kind === 'active') return { status: 'active', target, payee: result }
    if (result.kind === 'disputed') {
      return { status: 'disputed', target, changePendingUntil: result.changePendingUntil }
    }
    return { status: 'missing', target }
  } catch (error) {
    reportError(error)
    return { status: 'error', target, reason: chain.classifyChainError(error) }
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
    const registry = env.registry
    if (!registry) return setState({ status: 'undeployed', target })
    setState({ status: 'loading', target })
    const next = await lookup(registry, target)
    if (request === latest.current) setState(next)
  }, [])

  const reset = useCallback(() => {
    latest.current += 1
    setState({ status: 'idle' })
  }, [])

  return { state, resolve, reset }
}

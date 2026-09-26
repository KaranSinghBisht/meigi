import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Analysis } from '../../../lib/api/agentTypes'
import { payeeName, primaryName } from './primaryName'

/** Lower-cased address → the ENS name to show for it. */
export type NameMap = ReadonlyMap<string, string>

interface Names {
  readonly names: NameMap
  /** Every full address the analysis mentions, named or not (lower-cased). */
  readonly known: readonly string[]
}

const NamesContext = createContext<Names>({ names: new Map(), known: [] })

/** The names for the addresses in the current analysis (empty outside a provider: every address shows as hex). */
export function useAddressNames(): NameMap {
  return useContext(NamesContext).names
}

/**
 * The one full address a shortened token (0x9B4f…47e4) stands for, if exactly one address in the analysis fits
 * it. Two that fit (a look-alike vanity address) name neither: that is address poisoning, so it stays hex.
 */
export function useShortAddressMatch(): (token: string) => string | null {
  const { known } = useContext(NamesContext)
  return (token) => {
    const [head = '', tail = ''] = token.toLowerCase().split(/…|\.\.\./)
    const fits = known.filter((address) => address.startsWith(head) && address.endsWith(tail))
    return fits.length === 1 ? (fits[0] ?? null) : null
  }
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** Every full address an analysis mentions, other than the registered payout (which is named by the registry). */
function mentioned(analysis: Analysis): string[] {
  const { extracted, proposal, screening } = analysis
  const found = [
    extracted.address,
    ...extracted.addresses,
    proposal.status === 'ok' ? proposal.payTo : null,
    ...(screening.status === 'ok' ? screening.results.map((result) => result.address) : []),
  ]
  return [...new Set(found.filter((a): a is string => a !== null && ADDRESS.test(a)).map((a) => a.toLowerCase()))]
}

/**
 * Names for an analysis's addresses. The registered payout is named by the registry (t<digits>.payee.eth resolves
 * to it by construction); any other address gets its primary ENS name only if that forward-resolves back to it.
 */
function useNames(analysis: Analysis): Names {
  const registered = analysis.kernel.payee
  const [looked, setLooked] = useState<NameMap>(new Map())
  const addresses = useMemo(() => mentioned(analysis), [analysis])
  useEffect(() => {
    let live = true
    void Promise.all(addresses.map(async (a) => [a, await primaryName(a)] as const)).then((pairs) => {
      if (live) setLooked(new Map(pairs.filter((pair): pair is readonly [string, string] => pair[1] !== null)))
    })
    return () => {
      live = false
    }
  }, [addresses])
  return useMemo(() => {
    const names = new Map(looked)
    const known = new Set(addresses)
    if (registered?.registeredPayout) {
      const payout = registered.registeredPayout.toLowerCase()
      known.add(payout)
      if (registered.status === 'active') names.set(payout, payeeName(registered.tNumber))
    }
    return { names, known: [...known] }
  }, [looked, addresses, registered])
}

/** Names every address inside it by the analysis it belongs to (the result card, the pipeline, the refusal). */
export function AnalysisNames({ analysis, children }: { readonly analysis: Analysis; readonly children: ReactNode }) {
  return <NamesContext.Provider value={useNames(analysis)}>{children}</NamesContext.Provider>
}

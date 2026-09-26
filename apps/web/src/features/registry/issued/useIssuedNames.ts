import { useEffect, useState } from 'react'
import { readIssuedNames, readVaultAgent, type IssuedName, type VaultAgent } from '../../../lib/chain/names'
import type { ParsedTNumber } from '../../../lib/chain/tNumber'

export type IssuedNamesState =
  | { readonly kind: 'loading' }
  /** `agent` is null when the vault's agent couldn't be read: then nothing is said about a mandate. */
  | { readonly kind: 'ready'; readonly names: readonly IssuedName[]; readonly agent: VaultAgent | null }
  | { readonly kind: 'error' }

/** The names this company issued, read live once per T-number, with the vault's agent beside them. */
export function useIssuedNames(tNumber: ParsedTNumber): IssuedNamesState {
  const [state, setState] = useState<IssuedNamesState>({ kind: 'loading' })
  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    const agent = readVaultAgent().catch((error: unknown) => {
      reportError(error) // without it the page just doesn't mention a mandate
      return null
    })
    Promise.all([readIssuedNames(tNumber), agent]).then(
      ([names, vaultAgent]) => {
        if (live) setState({ kind: 'ready', names, agent: vaultAgent })
      },
      (error: unknown) => {
        reportError(error)
        if (live) setState({ kind: 'error' })
      },
    )
    return () => {
      live = false
    }
  }, [tNumber])
  return state
}

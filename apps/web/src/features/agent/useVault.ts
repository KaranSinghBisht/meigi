import { useEffect, useState } from 'react'
import { describeChainError } from '../../lib/chain/errors'
import { FIXTURE_T_NUMBER, parseTNumber } from '../../lib/chain/tNumber'
import { readVault, type VaultState } from '../../lib/chain/vault'

export type VaultLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly vault: VaultState }
  | { readonly kind: 'error'; readonly message: string }

const FIXTURE = parseTNumber(FIXTURE_T_NUMBER)

/** The AgentVault read live from Sepolia; `version` changes after each payment attempt, so it is read again. */
export function useVault(version = 0): VaultLoad {
  const [load, setLoad] = useState<VaultLoad>({ kind: 'loading' })
  useEffect(() => {
    if (!FIXTURE) return
    let live = true
    readVault(FIXTURE.value).then(
      (vault) => live && setLoad({ kind: 'ready', vault }),
      (error: unknown) => live && setLoad({ kind: 'error', message: describeChainError(error).message }),
    )
    return () => {
      live = false
    }
  }, [version])
  return load
}

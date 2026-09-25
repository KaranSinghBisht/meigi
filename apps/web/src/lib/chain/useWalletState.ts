import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EIP1193Provider } from 'viem'
import { sepolia } from 'viem/chains'
import type { HexAddress } from '../env/env'
import { describeChainError } from './errors'
import { authorisedAccounts, injectedProvider, requestAccounts, switchToSepolia, walletChainId } from './wallet'

export interface Wallet {
  readonly provider: EIP1193Provider | null
  readonly account: HexAddress | null
  readonly chainId: number | null
  readonly onSepolia: boolean
  readonly connecting: boolean
  readonly error: string | null
  connect(): Promise<HexAddress | null>
  /** Connects if needed and switches to Sepolia; returns the account, or null (with `error` set). */
  ready(): Promise<HexAddress | null>
}

type Setter<T> = (value: T) => void

function parseChainId(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return null
  const parsed = Number.parseInt(value, value.startsWith('0x') ? 16 : 10)
  return Number.isFinite(parsed) ? parsed : null
}

/** Follows account and network switches made in the wallet itself. */
function useWalletEvents(
  provider: EIP1193Provider | null,
  setAccount: Setter<HexAddress | null>,
  setChainId: Setter<number | null>,
) {
  useEffect(() => {
    if (!provider) return
    const onAccounts = (accounts: readonly string[]) => setAccount((accounts[0] as HexAddress | undefined) ?? null)
    const onChain = (chainId: string) => setChainId(parseChainId(chainId))
    provider.on('accountsChanged', onAccounts)
    provider.on('chainChanged', onChain)
    return () => {
      provider.removeListener('accountsChanged', onAccounts)
      provider.removeListener('chainChanged', onChain)
    }
  }, [provider, setAccount, setChainId])
}

/** Picks up a connection the user already granted, without prompting. */
function useRestore(
  provider: EIP1193Provider | null,
  setAccount: Setter<HexAddress | null>,
  setChainId: Setter<number | null>,
  setError: Setter<string | null>,
) {
  useEffect(() => {
    if (!provider) return
    let live = true
    Promise.all([authorisedAccounts(provider), walletChainId(provider)]).then(
      ([accounts, id]) => {
        if (!live) return
        setAccount(accounts[0] ?? null)
        setChainId(id)
      },
      (reason: unknown) => {
        if (live) setError(describeChainError(reason).message)
      },
    )
    return () => {
      live = false
    }
  }, [provider, setAccount, setChainId, setError])
}

export function useWalletState(): Wallet {
  const [provider] = useState(injectedProvider)
  const [account, setAccount] = useState<HexAddress | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Concurrent connects (header button and a form at once) share one wallet prompt.
  const pending = useRef<Promise<HexAddress | null> | null>(null)
  useWalletEvents(provider, setAccount, setChainId)
  useRestore(provider, setAccount, setChainId, setError)

  const connect = useCallback((): Promise<HexAddress | null> => {
    if (!provider) {
      setError('No browser wallet found. Install Brave Wallet or MetaMask.')
      return Promise.resolve(null)
    }
    pending.current ??= (async () => {
      setConnecting(true)
      setError(null)
      try {
        const [first] = await requestAccounts(provider)
        setAccount(first ?? null)
        setChainId(await walletChainId(provider))
        return first ?? null
      } catch (reason) {
        setError(describeChainError(reason).message)
        return null
      } finally {
        setConnecting(false)
        pending.current = null
      }
    })()
    return pending.current
  }, [provider])

  const ready = useReady(provider, account, connect, setChainId, setError)
  return useMemo<Wallet>(
    () => ({ provider, account, chainId, onSepolia: chainId === sepolia.id, connecting, error, connect, ready }),
    [provider, account, chainId, connecting, error, connect, ready],
  )
}

function useReady(
  provider: EIP1193Provider | null,
  account: HexAddress | null,
  connect: () => Promise<HexAddress | null>,
  setChainId: Setter<number | null>,
  setError: Setter<string | null>,
) {
  return useCallback(async (): Promise<HexAddress | null> => {
    const current = account ?? (await connect())
    if (!current || !provider) return null
    try {
      // Ask the wallet, not our state: a connect() that just finished may not have re-rendered yet.
      if ((await walletChainId(provider)) !== sepolia.id) await switchToSepolia(provider)
      setChainId(sepolia.id)
      return current
    } catch (reason) {
      setError(`Switch your wallet to Sepolia. ${describeChainError(reason).message}`)
      return null
    }
  }, [account, connect, provider, setChainId, setError])
}

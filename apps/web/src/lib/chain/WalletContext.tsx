import { createContext, useContext, type ReactNode } from 'react'
import { useWalletState, type Wallet } from './useWalletState'

export type { Wallet } from './useWalletState'

const WalletContext = createContext<Wallet | null>(null)

/** One injected wallet (window.ethereum) shared by every page. */
export function WalletProvider({ children }: { readonly children: ReactNode }) {
  const wallet = useWalletState()
  return <WalletContext.Provider value={wallet}>{children}</WalletContext.Provider>
}

export function useWallet(): Wallet {
  const wallet = useContext(WalletContext)
  if (!wallet) throw new Error('useWallet must be used inside <WalletProvider>')
  return wallet
}

import { shortAddress } from '../../lib/chain/format'
import { useWallet } from '../../lib/chain/WalletContext'
import { Button } from '../components/Button'
import './layout.css'

export function WalletButton() {
  const wallet = useWallet()

  if (!wallet.provider) {
    return (
      <span className="wallet-pill wallet-pill--none" title="Install Brave Wallet or MetaMask to sign">
        No wallet
      </span>
    )
  }
  if (!wallet.account) {
    return (
      <Button variant="ghost" busy={wallet.connecting} onClick={() => void wallet.connect()}>
        Connect wallet
      </Button>
    )
  }
  if (!wallet.onSepolia) {
    return (
      <Button variant="ghost" className="wallet-switch" onClick={() => void wallet.ready()}>
        Switch to Sepolia
      </Button>
    )
  }
  return (
    <span className="wallet-pill" title={wallet.account}>
      <span className="wallet-pill__dot" aria-hidden="true" />
      <span className="sr-only">Wallet connected on Sepolia: </span>
      <span className="mono">{shortAddress(wallet.account)}</span>
    </span>
  )
}

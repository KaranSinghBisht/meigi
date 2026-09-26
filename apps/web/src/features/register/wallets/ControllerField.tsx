import { useWallet } from '../../../lib/chain/WalletContext'
import { Address } from '../../../ui/components/Address'
import { Badge } from '../../../ui/components/Badge'
import { Button } from '../../../ui/components/Button'
import { Notice } from '../../../ui/components/Notice'

/** The business key: the connected browser wallet, which signs the domain proof and every later change. */
export function ControllerField() {
  const wallet = useWallet()
  if (!wallet.provider) {
    return (
      <Notice tone="warn" title="No browser wallet found.">
        <p>Install Brave Wallet or MetaMask, then reload this page.</p>
      </Notice>
    )
  }
  return (
    <div className="onboard-cell wallet-cell">
      {wallet.account ? (
        <div className="wallet-cell__row">
          <Address value={wallet.account} copy />
          <Badge tone="active">Connected</Badge>
        </div>
      ) : (
        <div className="wallet-cell__row">
          <p className="wallet-cell__empty">No wallet connected yet.</p>
          <Button variant="ghost" busy={wallet.connecting} onClick={() => void wallet.connect()}>
            Connect wallet
          </Button>
        </div>
      )}
      {wallet.error ? (
        <p className="field__error" role="alert">
          {wallet.error}
        </p>
      ) : null}
    </div>
  )
}

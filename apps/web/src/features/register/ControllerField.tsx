import { useWallet } from '../../lib/chain/WalletContext'
import { Address } from '../../ui/components/Address'
import { Button } from '../../ui/components/Button'
import './register.css'

/** The controller is the business key: the connected wallet, which also signs the domain proof next. */
export function ControllerField() {
  const wallet = useWallet()
  return (
    <div className="controller">
      <p className="field__label">Controller wallet (the business key)</p>
      {wallet.account ? (
        <p className="controller__value">
          <Address value={wallet.account} />
          <span className="controller__ok">✓ connected</span>
        </p>
      ) : (
        <div className="controller__connect">
          <Button variant="ghost" busy={wallet.connecting} onClick={() => void wallet.connect()}>
            Connect wallet
          </Button>
          <p className="field__hint">It signs the domain proof and, later, every payout change.</p>
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

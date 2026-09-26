import { usePayeeCount } from './usePayeeCount'
import './status.css'

/** "● Sepolia · n payees verified", only when the chain answered. */
export function StatusPill() {
  const count = usePayeeCount()
  if (count === null) return <span className="status-slot" aria-hidden="true" />
  const noun = count === 1 ? 'payee' : 'payees'
  return (
    <p className="pill pill--status" role="status">
      <span className="status__dot" aria-hidden="true" />
      Sepolia · {count.toLocaleString('en-US')} {noun} verified
    </p>
  )
}

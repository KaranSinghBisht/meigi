import { Link } from 'react-router'
import { usePayeeCount } from './usePayeeCount'
import './status.css'

/**
 * "● Sepolia · n registered payees", only when the chain answered. It opens the payee finder, like the links beside
 * it; screen readers hear the same words plus where they lead.
 */
export function StatusPill() {
  const count = usePayeeCount()
  if (count === null) return <span className="status-slot" aria-hidden="true" />
  const noun = count === 1 ? 'payee' : 'payees'
  return (
    <Link className="pill pill--status" to="/registry">
      <span className="status__dot" aria-hidden="true" />
      Sepolia · {count.toLocaleString('en-US')} registered {noun}
      <span className="sr-only">: browse them in the registry</span>
    </Link>
  )
}

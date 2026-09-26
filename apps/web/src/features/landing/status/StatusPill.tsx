import { Link } from 'react-router'
import { payeeCountsLabel, usePayeeCounts } from './usePayeeCounts'
import './status.css'

/**
 * "● Sepolia · 4 active payees · 1 disputed", only when the chain answered: the same label as /start and /registry.
 * It opens the payee finder, like the links beside it; screen readers hear the same words plus where they lead.
 */
export function StatusPill() {
  const counts = usePayeeCounts()
  if (counts === null) return <span className="status-slot" aria-hidden="true" />
  return (
    <Link className="pill pill--status" to="/registry">
      <span className="status__dot" aria-hidden="true" />
      Sepolia · {payeeCountsLabel(counts)}
      <span className="sr-only">: browse them in the registry</span>
    </Link>
  )
}

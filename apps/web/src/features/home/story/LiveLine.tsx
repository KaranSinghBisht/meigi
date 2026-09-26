import { useAgentStatus, usePaidThisMonth, useRegisteredPayeeCount } from '../../live'

/**
 * The chain answering under the closing line: live Sepolia figures in one quiet mono line. Each figure shows only
 * once it has been read, and the line stays away until at least one has.
 */
export function LiveLine() {
  const payees = useRegisteredPayeeCount()
  const agent = useAgentStatus()
  const paid = usePaidThisMonth()
  const parts = [
    payees === null ? null : `${payees} registered ${payees === 1 ? 'payee' : 'payees'}`,
    agent.status ? `${agent.name} ${agent.status}` : null,
    paid ? `${paid.amount} mJPYC paid this month` : null,
  ].filter((part): part is string => part !== null)
  if (parts.length === 0) return null
  // Each figure stays whole; a line may only break after a separator, never before one.
  return (
    <p className="closing__live" aria-live="polite">
      <span className="closing__dot" aria-hidden="true" />
      {['Live on Sepolia', ...parts].map((part, i, all) => (
        <span key={part}>
          <span className="nowrap">{part}</span>
          {i < all.length - 1 ? '\u00a0· ' : null}
        </span>
      ))}
    </p>
  )
}

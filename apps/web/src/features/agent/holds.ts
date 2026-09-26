import type { Analysis } from '../../lib/api/agentTypes'

/**
 * Holds the vault enforces itself, as the agent lists them (services/agent CHAIN_CHECKED). Forcing past one only
 * asks the chain, which refuses: that refusal is the attack demo. A revert name alone isn't enough (a credit
 * note's zero amount names one, but the agent refuses to force it), and a judgement hold is only ever released
 * by a verified human, so everywhere else the button is left out.
 */
const CHAIN_CHECKED = new Set([
  'payout_mismatch',
  'payee_not_registered',
  'payee_disputed',
  'vendor_not_approved',
  'vendor_not_yet_active',
  'vendor_payout_changed',
  'over_payment_cap',
  'over_period_cap',
  'invoice_already_paid',
  'insufficient_balance',
  'vault_paused',
  'not_agent',
])

/**
 * "Let the agent pay anyway" is offered only when at least one blocking hold is one the chain enforces, and never on
 * an invoice a verified human could approve: the agent decides that (`approval.approvable`), and forcing one of
 * those only ever answers force_needs_human.
 */
export function attackDemoFits(analysis: Analysis): boolean {
  if (analysis.verdict.decision !== 'hold' || analysis.approval.approvable) return false
  return analysis.verdict.reasons.some((reason) => reason.severity === 'block' && CHAIN_CHECKED.has(reason.code))
}

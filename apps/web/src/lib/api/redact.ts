// A queued payout must never be presented before it lands: until then nobody should pay it, and the UI
// must not make it look like the company's next address. The agent's messages can name it, so every text
// it sends passes through a redactor before it reaches the screen.

import type { Analysis, PayOutcome, Reason } from './agentTypes'

const ANY_ADDRESS = /0x[0-9a-fA-F]{40}/g
const QUEUED_CLAUSE = /\s*\([^()]*\bqueued payout change\b[^()]*\)/g
const HIDDEN = 'a queued address (hidden until it lands)'
const NEUTRAL_CLAUSE = ' (a payout change for this company is queued; nothing is paid to it before it lands)'

export type Redactor = (text: string) => string

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Removes the known queued address (any letter case) and the agent's "X is a queued payout change" clause. */
export function queuedRedactor(pending: string | null): Redactor {
  const exact = pending && /^0x[0-9a-fA-F]{40}$/.test(pending) ? new RegExp(escapeRegExp(pending), 'gi') : null
  return (text) => {
    const neutral = text.replace(QUEUED_CLAUSE, NEUTRAL_CLAUSE)
    return exact ? neutral.replace(exact, HIDDEN) : neutral
  }
}

/** A notice about the queued change itself: every address in it is the queued one. */
export function redactPendingNotice(code: string, message: string): string {
  return code === 'payout_change_pending' ? message.replace(ANY_ADDRESS, HIDDEN) : message
}

function reasons<T extends Pick<Reason, 'message'>>(list: readonly T[], redact: Redactor): T[] {
  return list.map((item) => ({ ...item, message: redact(item.message) }))
}

export function redactAnalysis(analysis: Analysis, redact: Redactor): Analysis {
  const { extracted, kernel, verdict, explanation, proposal } = analysis
  return {
    ...analysis,
    extracted: { ...extracted, flags: reasons(extracted.flags, redact) },
    kernel: { ...kernel, checks: reasons(kernel.checks, redact), reasons: reasons(kernel.reasons, redact) },
    verdict: { ...verdict, reasons: reasons(verdict.reasons, redact), warnings: reasons(verdict.warnings, redact) },
    explanation: { ...explanation, text: redact(explanation.text) },
    proposal: proposal.status === 'ok' ? { ...proposal, reasoning: redact(proposal.reasoning) } : proposal,
  }
}

export function redactOutcome(outcome: PayOutcome, redact: Redactor): PayOutcome {
  if (outcome.status === 'paid') return outcome
  const explanation = { ...outcome.explanation, text: redact(outcome.explanation.text) }
  if (outcome.status === 'held') return { ...outcome, reasons: reasons(outcome.reasons, redact), explanation }
  return { ...outcome, error: { ...outcome.error, sentence: redact(outcome.error.sentence) }, explanation }
}

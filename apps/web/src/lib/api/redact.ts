// A queued payout must never be presented before it lands: until then nobody should pay it, and the UI
// must not make it look like the company's next address. The agent no longer sends the queued address, and
// these rewrites keep any wording that would single it out off the screen.

import type { Analysis, PayOutcome, Reason } from './agentTypes'

const ANY_ADDRESS = /0x[0-9a-fA-F]{40}/g
const QUEUED_CLAUSE = /\s*\([^()]*\bqueued payout change\b[^()]*\)/g
const NEUTRAL_CLAUSE = ' (a payout change for this company is queued; nothing is paid to it before it lands)'

/** Rewrites an "X is a queued payout change" clause so it no longer points at an address. */
export function redactText(text: string): string {
  return text.replace(QUEUED_CLAUSE, NEUTRAL_CLAUSE)
}

/** A notice about the queued change itself: any address in it would be the queued one. */
export function redactPendingNotice(code: string, message: string): string {
  const text = redactText(message)
  return code === 'payout_change_pending' ? text.replace(ANY_ADDRESS, 'a queued address (hidden until it lands)') : text
}

function messages<T extends Pick<Reason, 'message'>>(list: readonly T[]): T[] {
  return list.map((item) => ({ ...item, message: redactText(item.message) }))
}

export function redactAnalysis(analysis: Analysis): Analysis {
  const { extracted, kernel, verdict, explanation, proposal } = analysis
  return {
    ...analysis,
    extracted: { ...extracted, flags: messages(extracted.flags) },
    kernel: { ...kernel, checks: messages(kernel.checks), reasons: messages(kernel.reasons) },
    verdict: { ...verdict, reasons: messages(verdict.reasons), warnings: messages(verdict.warnings) },
    explanation: { ...explanation, text: redactText(explanation.text) },
    proposal: proposal.status === 'ok' ? { ...proposal, reasoning: redactText(proposal.reasoning) } : proposal,
  }
}

export function redactOutcome(outcome: PayOutcome): PayOutcome {
  if (outcome.status === 'paid' || outcome.status === 'pending') return outcome
  const explanation = { ...outcome.explanation, text: redactText(outcome.explanation.text) }
  if (outcome.status === 'held') return { ...outcome, reasons: messages(outcome.reasons), explanation }
  return { ...outcome, error: { ...outcome.error, sentence: redactText(outcome.error.sentence) }, explanation }
}

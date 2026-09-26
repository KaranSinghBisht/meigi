import type { StoredAnalysis } from "../analysis/store.js";

/**
 * The holds a verified human may release: judgement calls (System-1's hold, pressure, the auto-clear budget) and a
 * configured screen that couldn't answer.
 * Never document integrity (credit notes, hidden content, markup, ambiguous totals, missing numbers, several
 * addresses) and never anything the chain would refuse anyway: those return 409.
 */
export const APPROVABLE = new Set(["triage_hold", "triage_unavailable", "pressure_hold", "above_auto_clear_budget", "screening_unavailable"]);

export function blockingCodes(stored: StoredAnalysis): string[] {
  return [...new Set(stored.verdict.reasons.filter((r) => r.severity === "block").map((r) => r.code))];
}

/** Why a human can't approve this invoice, or null when every hold on it is approvable. */
export function approvalRefusal(stored: StoredAnalysis): string | null {
  if (stored.payment?.status === "paid") return "the invoice is already paid";
  if (stored.verdict.decision === "pay") return "the invoice isn't held, so there is nothing to approve";
  const blocks = blockingCodes(stored);
  const blockers = blocks.filter((code) => !APPROVABLE.has(code));
  if (blockers.length > 0) return `a person can't release these holds: ${blockers.join(", ")}`;
  if (blocks.length === 0) return "the hold names no reason a person could release";
  if (!stored.intent || stored.intent.amount <= 0n) return "there is no payable amount";
  return null;
}

/**
 * What an approval is bound to, server-side (the device grant can't carry a binding message): the invoice, the
 * payee, the payout, the amount, the invoice reference and the holds. Any change voids the approval.
 */
export function bindingOf(stored: StoredAnalysis): string {
  const intent = stored.intent;
  return JSON.stringify({
    invoiceId: stored.view.id,
    tNumber: intent?.tNumber ?? null,
    payTo: intent?.payTo ?? null,
    registeredPayout: stored.view.kernel.payee?.registeredPayout ?? null,
    amount: intent?.amount.toString() ?? null,
    invoiceRef: intent?.invoiceRef ?? null,
    holds: blockingCodes(stored).sort(),
  });
}

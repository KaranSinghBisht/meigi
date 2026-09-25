import { APPROVABLE, approvalRefusal, blockingCodes } from "../approval/holds.js";
import type { Reason } from "../kernel/reasons.js";
import type { StoredAnalysis } from "./store.js";

/**
 * The holds `force` may push past into a simulation: judgement holds (triage, pressure, the budget, injection
 * wording) and the payee/vendor holds the vault enforces itself, whose revert is the attack demo. Everything else
 * (a credit note, hidden content, ambiguous totals, a missing invoice number, several addresses, a screening
 * hit...) is about the document's integrity or the payee's safety, and isn't even simulated. An allow-list, so new
 * reason codes are refused until someone decides otherwise.
 */
const FORCE_OVERRIDABLE = new Set([
  ...APPROVABLE,
  "urgent_language",
  "prompt_injection_suspected",
  "payout_mismatch",
  "payee_not_registered",
  "payee_disputed",
  "vendor_not_approved",
  "vendor_not_yet_active",
  "vendor_payout_changed",
  "over_payment_cap",
  "over_period_cap",
  "invoice_already_paid",
  "insufficient_balance",
  "vault_paused",
  "not_agent",
]);

/** Before a forced payment is simulated: holds force may not even simulate past. */
export function forceRefusal(stored: StoredAnalysis): Reason | null {
  const never = blockingCodes(stored).filter((code) => !FORCE_OVERRIDABLE.has(code));
  return never.length === 0 ? null : refusal(stored, "force_refused", `Force can't override these holds: ${never.join(", ")}.`);
}

/**
 * A forced payment the chain would accept. Force only shows the chain's refusal and never pays, so it can never
 * stand in for the verified human a hold needs: nothing is sent.
 */
export function forcePassed(stored: StoredAnalysis): Reason {
  if (approvalRefusal(stored) === null) {
    return refusal(stored, "force_needs_human", "Forcing can't pay; only a verified human can release this hold.");
  }
  return refusal(stored, "force_refused", "Forcing can't pay; it only shows the vault's answer, and the vault would accept this one.");
}

/** A verified human's approval releases the approvable holds and nothing else. */
export function approvedRefusal(stored: StoredAnalysis): Reason | null {
  const blockers = blockingCodes(stored).filter((code) => !APPROVABLE.has(code));
  if (blockers.length === 0) return null;
  return refusal(stored, "approval_refused", `A person's approval can't release these holds: ${blockers.join(", ")}.`);
}

function refusal(stored: StoredAnalysis, code: string, message: string): Reason {
  const payee = stored.view.kernel.payee;
  return {
    code,
    severity: "block",
    layer: "kernel",
    tNumber: payee?.tNumber ?? stored.view.extracted.tNumber,
    legalName: payee?.legalName ?? null,
    message,
  };
}

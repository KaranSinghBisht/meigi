import { APPROVABLE, blockingCodes } from "../approval/holds.js";
import type { Reason } from "../kernel/reasons.js";
import type { StoredAnalysis } from "./store.js";

/**
 * Holds the vault enforces itself (each has a revert). Forcing past one only asks the chain, which refuses it:
 * that is the attack demo.
 */
const CHAIN_CHECKED = new Set([
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

/**
 * The only holds `force` may push past on its way to the chain: the chain-checked ones, and judgement holds
 * (triage, pressure, the budget, injection wording) alongside them. Everything else (a credit note, hidden
 * content, ambiguous totals, a missing invoice number, several addresses, a screening hit...) is about the
 * document's integrity or the payee's safety and is never overridden. Allow-lists, so new reason codes are
 * refused until someone decides otherwise.
 */
const FORCE_OVERRIDABLE = new Set([...APPROVABLE, "urgent_language", "prompt_injection_suspected", ...CHAIN_CHECKED]);

/**
 * Before a forced payment is simulated. Force is refused unless every hold is overridable and the chain enforces
 * at least one of them: otherwise the chain would simply pay, and force would stand in for a person.
 */
export function forceRefusal(stored: StoredAnalysis): Reason | null {
  const blocks = blockingCodes(stored);
  const never = blocks.filter((code) => !FORCE_OVERRIDABLE.has(code));
  if (never.length > 0) return refusal(stored, "force_refused", `Force can't override these holds: ${never.join(", ")}.`);
  return blocks.some((code) => CHAIN_CHECKED.has(code)) ? null : notForForce(stored, blocks);
}

/**
 * After a forced payment simulated cleanly, the chain has cleared its own holds (its state changed since the
 * analysis). Whatever else held the payment still stands, so it is sent only when the chain enforced every hold.
 */
export function forceSendRefusal(stored: StoredAnalysis): Reason | null {
  const rest = blockingCodes(stored).filter((code) => !CHAIN_CHECKED.has(code));
  return rest.length === 0 ? null : notForForce(stored, rest);
}

/** A verified human's approval releases the approvable holds and nothing else. */
export function approvedRefusal(stored: StoredAnalysis): Reason | null {
  const blockers = blockingCodes(stored).filter((code) => !APPROVABLE.has(code));
  if (blockers.length === 0) return null;
  return refusal(stored, "approval_refused", `A person's approval can't release these holds: ${blockers.join(", ")}.`);
}

function notForForce(stored: StoredAnalysis, holds: string[]): Reason {
  if (holds.every((code) => APPROVABLE.has(code))) {
    return refusal(stored, "force_needs_human", "Only a verified human can release this hold; forcing can't.");
  }
  return refusal(stored, "force_refused", `Forcing only asks the vault, and it enforces none of these holds: ${holds.join(", ")}.`);
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

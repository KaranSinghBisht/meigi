import { zeroAddress, type Address, type Hex } from "viem";
import { describeRevert, MANDATE_ERRORS, type DecodedRevert } from "../chain/describe.js";
import { registeredName } from "../chain/format.js";
import type { PayCall, PaymentReceipt, RawRevert } from "../chain/types.js";
import type { AppDeps } from "../deps.js";
import type { PaymentIntent } from "../kernel/intent.js";
import type { Reason } from "../kernel/reasons.js";
import { explainOutcome, type Explanation } from "./explain.js";
import { approvedRefusal, forcePassed, forceRefusal } from "./override.js";
import type { StoredAnalysis } from "./store.js";

export type PayResult =
  | { status: "paid"; txHash: Hex; blockNumber: string; forced: boolean; payTo: Address; amount: string; invoiceRef: Hex }
  | { status: "pending"; txHash: Hex; forced: boolean; message: string }
  | { status: "reverted"; broadcast: boolean; txHash?: Hex; forced: boolean; error: DecodedRevert; explanation: Explanation }
  | { status: "held"; reasons: Reason[]; explanation: Explanation };

/** "auto" sends only a "pay" verdict; "force" simulates a held one (the attack demo); "approved" is a verified human's release. */
export type PayMode = "auto" | "force" | "approved";

/**
 * Pays an analysed invoice through the signer, which holds the agent key. In "auto" mode only a "pay" verdict is
 * sent. "force" is simulate-only: it shows the chain's decoded refusal of a held payment and never sends anything,
 * so it can never stand in for a verified human (override.ts). "approved" (the caller has spent a verified human's
 * approval, `approval`) releases the approvable holds only, and the approval goes to the signer, whose own ceiling
 * needs it. Every payment is simulated first and pays the printed amount to the registered payee of the printed
 * T-number. `record` sees a sent transaction before its receipt.
 */
export async function payAnalysis(
  deps: AppDeps,
  stored: StoredAnalysis,
  mode: PayMode,
  record: (r: PayResult) => void,
  approval?: { idToken: string },
): Promise<PayResult> {
  const previous = stored.payment;
  if (previous?.status === "paid") return previous;
  if (previous?.status === "pending") return settlePending(deps, stored, previous);
  const { intent, verdict } = stored;
  const isHeld = verdict.decision !== "pay";
  if (isHeld && mode === "auto") return held(stored, verdict.reasons);
  const forced = mode === "force"; // simulate-only, on a held invoice or one that would pay anyway
  const refused = forced ? forceRefusal(stored) : isHeld ? approvedRefusal(stored) : null;
  if (refused) return held(stored, [refused]);
  if (!intent) return held(stored, verdict.reasons);
  if (intent.amount <= 0n) return held(stored, notPayable(stored, intent));
  const call = callOf(intent);
  const simulated = await deps.payer.simulate(call);
  if (!simulated.ok) return (await mandateHold(deps, stored, simulated.revert)) ?? reverted(deps, stored, simulated.revert, forced);
  if (forced) return held(stored, [forcePassed(stored)]); // force never sends
  const flagged = await screenPayout(deps, stored, simulated.payout);
  if (flagged) return held(stored, [flagged]);
  const pending = (txHash: Hex): PayResult => ({ status: "pending", txHash, forced, message: "Sent; waiting for the block. Pay again to check." });
  const sent = await deps.payer.send({ ...call, ...(approval ? { approval } : {}) }, (txHash) => record(pending(txHash)));
  if (sent.ok === "pending") return pending(sent.txHash);
  if (sent.ok === "refused") return held(stored, [signerRefusal(stored, sent.message)]);
  if (!sent.ok) return (await mandateHold(deps, stored, sent.revert)) ?? reverted(deps, stored, sent.revert, forced);
  return mined(deps, stored, sent.receipt, forced, simulated.payout);
}

export function callOf(intent: PaymentIntent): PayCall {
  return {
    tNumber: BigInt(intent.tNumber),
    expectedPayout: intent.payTo ?? zeroAddress,
    amount: intent.amount,
    invoiceRef: intent.invoiceRef,
  };
}

/** A transaction sent earlier whose receipt wasn't seen yet: look it up, never send again. */
async function settlePending(deps: AppDeps, stored: StoredAnalysis, previous: Extract<PayResult, { status: "pending" }>) {
  const receipt = await deps.payer.receipt(previous.txHash);
  if (!receipt) return previous;
  const payTo = stored.view.kernel.payee?.registeredPayout ?? stored.intent?.payTo ?? zeroAddress;
  return mined(deps, stored, receipt, previous.forced, payTo);
}

async function mined(deps: AppDeps, stored: StoredAnalysis, receipt: PaymentReceipt, forced: boolean, payTo: Address): Promise<PayResult> {
  if (receipt.status !== "success") {
    // Mined but reverted (state changed after the simulation): it *was* broadcast, so say so.
    return reverted(deps, stored, { name: "TransactionReverted", inputs: [], args: [] }, forced, receipt.txHash);
  }
  const { intent } = stored;
  return {
    status: "paid",
    txHash: receipt.txHash,
    blockNumber: receipt.blockNumber.toString(),
    forced,
    payTo,
    amount: intent?.amountDisplay ?? "",
    invoiceRef: intent?.invoiceRef ?? "0x",
  };
}

async function reverted(deps: AppDeps, stored: StoredAnalysis, raw: RawRevert, forced: boolean, txHash?: Hex): Promise<PayResult> {
  const { decimals } = await deps.chain.token();
  const error = await describeRevert(raw, {
    decimals,
    nameOf: async (tNumber) => registeredName(await deps.chain.payee(tNumber)),
  });
  const explanation = await explainOutcome(deps.llm, stored.view.kernel, stored.verdict, error);
  return { status: "reverted", broadcast: txHash !== undefined, ...(txHash ? { txHash } : {}), forced, error, explanation };
}

function held(stored: StoredAnalysis, reasons: Reason[]): PayResult {
  return { status: "held", reasons, explanation: stored.view.explanation };
}

/**
 * The address the vault would pay, screened again right before sending. The verdict may be minutes old, and a flag
 * raised since then must hold the payment: a flagged result, or no answer at all, holds it. Skipped only when
 * screening isn't configured, as at analysis.
 */
async function screenPayout(deps: AppDeps, stored: StoredAnalysis, payout: Address): Promise<Reason | null> {
  if (!deps.screening.enabled) return null;
  const screened = await deps.screening.screen([payout], { fresh: true });
  if (screened.status === "not_configured") return null;
  const payee = stored.view.kernel.payee;
  const about = { layer: "screening" as const, severity: "block" as const, tNumber: payee?.tNumber ?? stored.view.extracted.tNumber, legalName: payee?.legalName ?? null };
  const hit = screened.status === "ok" ? screened.results.find((r) => r.flagged) : undefined;
  if (hit) return { ...about, code: "screening_flagged", message: `Intercepta now flags ${payout} (toxic score ${hit.toxicScore}), so nothing was sent.` };
  if (screened.status !== "ok" || screened.errors.length > 0) {
    return { ...about, code: "screening_unavailable", message: `${payout} could not be screened again before sending, so nothing was sent.` };
  }
  return null;
}

/**
 * The MandateGate refused: the buyer company's ENS mandate for this agent doesn't answer (revoked, expired, frozen),
 * names another key, or the company is disputed. That is a hold about the agent's authority, not the invoice, and
 * nothing was sent.
 */
async function mandateHold(deps: AppDeps, stored: StoredAnalysis, raw: RawRevert): Promise<PayResult | null> {
  if (!MANDATE_ERRORS.has(raw.name)) return null;
  const { decimals } = await deps.chain.token();
  const error = await describeRevert(raw, { decimals, nameOf: async () => null });
  const payee = stored.view.kernel.payee;
  const reason: Reason = {
    code: raw.name === "MandateNotLive" ? "mandate_not_live" : raw.name === "NotMandateHolder" ? "not_mandate_holder" : "mandate_principal_not_active",
    severity: "block",
    layer: "kernel",
    tNumber: payee?.tNumber ?? stored.view.extracted.tNumber,
    legalName: payee?.legalName ?? null,
    message: error.sentence,
    revert: raw.name,
  };
  return held(stored, [reason]);
}

/** The signer applied its own rule (a ceiling only a fresh human approval lifts) and sent nothing. */
function signerRefusal(stored: StoredAnalysis, message: string): Reason {
  const payee = stored.view.kernel.payee;
  return {
    code: "signer_refused",
    severity: "block",
    layer: "kernel",
    tNumber: payee?.tNumber ?? stored.view.extracted.tNumber,
    legalName: payee?.legalName ?? null,
    message,
  };
}

function notPayable(stored: StoredAnalysis, intent: PaymentIntent): Reason[] {
  const payee = stored.view.kernel.payee;
  return [
    {
      code: "not_payable",
      severity: "block",
      layer: "kernel",
      tNumber: `T${intent.tNumber}`,
      legalName: payee?.legalName ?? null,
      message: `Nothing to send: the amount is ${intent.amountDisplay}. A credit note or refund is never paid out.`,
    },
  ];
}

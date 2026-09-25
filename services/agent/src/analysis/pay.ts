import { zeroAddress, type Address, type Hex } from "viem";
import { describeRevert, type DecodedRevert } from "../chain/describe.js";
import type { PayCall, PaymentReceipt, RawRevert } from "../chain/types.js";
import type { AppDeps } from "../deps.js";
import type { PaymentIntent } from "../kernel/intent.js";
import type { Reason } from "../kernel/reasons.js";
import { explainOutcome, type Explanation } from "./explain.js";
import type { StoredAnalysis } from "./store.js";

export type PayResult =
  | { status: "paid"; txHash: Hex; blockNumber: string; forced: boolean; payTo: Address; amount: string; invoiceRef: Hex }
  | { status: "pending"; txHash: Hex; forced: boolean; message: string }
  | { status: "reverted"; broadcast: boolean; txHash?: Hex; forced: boolean; error: DecodedRevert; explanation: Explanation }
  | { status: "held"; reasons: Reason[]; explanation: Explanation };

/**
 * The only holds `force` may override. Triage, pressure and injection holds are judgements about intent, and
 * every payee/vendor reason is re-checked by the vault itself (its revert is the demo). Everything else (a credit
 * note, hidden content, ambiguous totals, a missing invoice number, several addresses, a screening hit...) is
 * about the document's integrity or the payee's safety, and is never overridden. An allow-list, so new
 * reason codes are refused until someone decides otherwise.
 */
const FORCE_OVERRIDABLE = new Set([
  "triage_hold",
  "triage_unavailable",
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

/**
 * Pays an analysed invoice from the agent key. Without `force` only a "pay" verdict is sent. With `force`, a
 * held payment is attempted to show the chain's answer: always simulated first, and a simulated revert is
 * decoded and returned without broadcasting. A forced payment the chain accepts is sent; it pays the printed
 * amount to the registered payee of the printed T-number. `record` sees a sent transaction before its receipt.
 */
export async function payAnalysis(deps: AppDeps, stored: StoredAnalysis, force: boolean, record: (r: PayResult) => void): Promise<PayResult> {
  const previous = stored.payment;
  if (previous?.status === "paid") return previous;
  if (previous?.status === "pending") return settlePending(deps, stored, previous);
  const { intent, verdict } = stored;
  const forced = force && verdict.decision !== "pay";
  if (!force && verdict.decision !== "pay") return held(stored, verdict.reasons);
  const refused = forced ? forceRefusal(stored) : null;
  if (refused) return held(stored, [refused]);
  if (!intent) return held(stored, verdict.reasons);
  if (intent.amount <= 0n) return held(stored, notPayable(stored, intent));
  const call = callOf(intent);
  const simulated = await deps.payer.simulate(call);
  if (!simulated.ok) return reverted(deps, stored, simulated.revert, forced);
  const pending = (txHash: Hex): PayResult => ({ status: "pending", txHash, forced, message: "Sent; waiting for the block. Pay again to check." });
  const sent = await deps.payer.send(call, (txHash) => record(pending(txHash)));
  if (sent.ok === "pending") return pending(sent.txHash);
  if (!sent.ok) return reverted(deps, stored, sent.revert, forced);
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
    nameOf: async (tNumber) => (await deps.chain.payee(tNumber)).legalName || null,
  });
  const explanation = await explainOutcome(deps.llm, stored.view.kernel, stored.verdict, error);
  return { status: "reverted", broadcast: txHash !== undefined, ...(txHash ? { txHash } : {}), forced, error, explanation };
}

function held(stored: StoredAnalysis, reasons: Reason[]): PayResult {
  return { status: "held", reasons, explanation: stored.view.explanation };
}

function forceRefusal(stored: StoredAnalysis): Reason | null {
  const doubtful = stored.verdict.reasons.filter((r) => r.severity === "block" && !FORCE_OVERRIDABLE.has(r.code)).map((r) => r.code);
  if (doubtful.length === 0) return null;
  const payee = stored.view.kernel.payee;
  return {
    code: "force_refused",
    severity: "block",
    layer: "kernel",
    tNumber: payee?.tNumber ?? stored.view.extracted.tNumber,
    legalName: payee?.legalName ?? null,
    message: `Force can't override these holds: ${[...new Set(doubtful)].join(", ")}.`,
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

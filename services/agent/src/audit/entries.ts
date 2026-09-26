import type { PayMode, PayResult } from "../analysis/pay.js";
import type { StoredAnalysis } from "../analysis/store.js";
import type { Reason } from "../kernel/reasons.js";
import { sha256 } from "./log.js";

/**
 * What the audit log keeps about each step: the facts a reviewer needs to reconstruct a decision, in our own words.
 * Document text never goes in (only its hash), nor a reason's `evidence`, which quotes the document.
 */

function reasonsOf(reasons: Reason[]) {
  return reasons.map((r) => ({ code: r.code, layer: r.layer, severity: r.severity, message: r.message, ...(r.revert ? { revert: r.revert } : {}) }));
}

/** A document was analysed and decided (pay or hold). Nothing moved. */
export function analysisEntry(stored: StoredAnalysis, text: string, approvable: boolean) {
  const { view, intent } = stored;
  const flagged = view.screening.status === "ok" ? view.screening.results.filter((r) => r.flagged).map((r) => ({ address: r.address, toxicScore: r.toxicScore })) : [];
  return {
    analysisId: view.id,
    documentSha256: sha256(text),
    tNumber: intent ? `T${intent.tNumber}` : view.extracted.tNumber,
    invoiceNumber: intent?.invoiceNumber ?? view.extracted.invoiceNumber,
    amount: intent?.amountDisplay ?? view.extracted.amount?.display ?? null,
    payTo: intent?.payTo ?? null,
    registeredPayout: view.kernel.payee?.registeredPayout ?? null,
    invoiceRef: intent?.invoiceRef ?? null,
    decision: stored.verdict.decision,
    reasons: reasonsOf(stored.verdict.reasons),
    warnings: stored.verdict.warnings.map((w) => w.code),
    triage: view.triage.status === "ok" ? { model: view.triage.model, route: view.triage.route, pSafe: view.triage.pSafe } : { status: view.triage.status },
    proposal: view.proposal.status === "ok" ? { model: view.proposal.model, wouldPay: view.proposal.wouldPay, payTo: view.proposal.payTo } : { status: view.proposal.status },
    screening: { status: view.screening.status, flagged },
    approvable,
  };
}

/** A pay attempt and its outcome: sent, mined, reverted (and whether anything was broadcast) or held. */
export function paymentEntry(stored: StoredAnalysis, mode: PayMode, approvalId: string | null, result: PayResult) {
  const base = { analysisId: stored.view.id, mode, approvalId, status: result.status };
  switch (result.status) {
    case "paid":
      return { ...base, txHash: result.txHash, blockNumber: result.blockNumber, payTo: result.payTo, amount: result.amount, invoiceRef: result.invoiceRef };
    case "pending":
      return { ...base, txHash: result.txHash };
    case "reverted":
      return { ...base, broadcast: result.broadcast, txHash: result.txHash ?? null, revert: result.error.name };
    case "held":
      return { ...base, reasons: reasonsOf(result.reasons) };
  }
}

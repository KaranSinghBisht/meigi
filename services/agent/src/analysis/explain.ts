import type { DecodedRevert } from "../chain/describe.js";
import { payeeLabel } from "../chain/format.js";
import { invoiceLabel } from "../kernel/intent.js";
import type { KernelResult } from "../kernel/kernel.js";
import { LlmError, type ExplanationFacts, type LlmPort } from "../llm/types.js";
import type { Verdict } from "./verdict.js";

export interface Explanation {
  source: "llm" | "template";
  text: string;
  model?: string;
  error?: string; // why the LLM wasn't used, when it was configured
}

/**
 * A short human explanation of a hold or revert. The LLM only sees facts the kernel and the chain produced
 * (never the document), and it only phrases them: the decision was made before it is called.
 */
export async function explainOutcome(
  llm: LlmPort | null,
  kernel: KernelResult,
  verdict: Verdict,
  revert: DecodedRevert | null = null,
  broadcast = false, // a revert of a transaction that was sent and mined; otherwise the refusal was in simulation
): Promise<Explanation> {
  const template = templateText(kernel, verdict, revert, broadcast);
  if (verdict.decision === "pay" && !revert) return { source: "template", text: template };
  if (!llm) return { source: "template", text: template };
  try {
    const text = await llm.explain(factsOf(kernel, verdict, revert, broadcast));
    return { source: "llm", text, model: llm.model };
  } catch (error) {
    if (!(error instanceof LlmError)) {
      process.stderr.write(`[agent] explanation failed: ${error instanceof Error ? error.name : "error"}\n`);
    }
    const reason = error instanceof LlmError ? error.message : "unexpected error";
    return { source: "template", text: template, error: reason };
  }
}

export function factsOf(kernel: KernelResult, verdict: Verdict, revert: DecodedRevert | null, broadcast = false): ExplanationFacts {
  return {
    decision: revert ? "reverted" : verdict.decision,
    payee: {
      tNumber: kernel.payee?.tNumber ?? kernel.intent?.tNumber ?? null,
      legalName: kernel.payee?.legalName ?? null,
      registeredPayout: kernel.payee?.registeredPayout ?? null,
    },
    payment: { payTo: kernel.intent?.payTo ?? null, amount: kernel.intent?.amount.display ?? null },
    reasons: verdict.reasons.slice(0, 6).map((r) => ({ code: r.code, message: r.message })),
    revert: revert ? { name: revert.name, sentence: revert.sentence, broadcast } : null,
  };
}

/** The deterministic fallback, and the text used when every check passed. */
export function templateText(kernel: KernelResult, verdict: Verdict, revert: DecodedRevert | null, broadcast = false): string {
  if (revert && broadcast) return `The vault refused the payment on-chain: ${revert.sentence}`;
  if (revert) return `The vault refused the payment (in simulation; nothing was sent): ${revert.sentence}`;
  const intent = kernel.intent;
  if (verdict.decision === "pay" && intent && kernel.payee) {
    const label = payeeLabel(kernel.payee.tNumber, kernel.payee.legalName);
    const to = kernel.payee.registeredPayout ?? intent.expectedPayout;
    return `Ready to pay ${intent.amount.display} for ${invoiceLabel(intent.invoiceNumber)} to ${label} at its registered payout ${to}. Every check passed.`;
  }
  const top = verdict.reasons.slice(0, 3).map((r) => r.message);
  return top.length > 0 ? `Held: ${top.join(" ")}` : "Held for review.";
}

import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import type { PayeeState } from "../chain/types.js";
import type { AppDeps } from "../deps.js";
import { extractInvoice } from "../extract/extract.js";
import { normalizeText } from "../extract/normalize.js";
import type { Extracted } from "../extract/types.js";
import { runKernel, type KernelResult } from "../kernel/kernel.js";
import type { PaymentIntent } from "../kernel/intent.js";
import { LlmError, type LlmPort, type Proposal } from "../llm/types.js";
import type { Screening, ScreeningPort } from "../screening/intercepta.js";
import { buildTriageState } from "../triage/state.js";
import type { TriageResult } from "../triage/triage.js";
import { explainOutcome, type Explanation } from "./explain.js";
import type { StoredAnalysis } from "./store.js";
import { decide, type Verdict } from "./verdict.js";

/** What the agent LLM reads: invoices are short; a 60 KB body is no reason to spend 60 KB of tokens. */
const MAX_PROPOSAL_CHARS = 12_000;

export type ProposalView =
  | ({ status: "ok"; provider: string; model: string; latencyMs: number } & Proposal)
  | { status: "unavailable"; provider: string; message: string };

export interface Timings {
  extractMs: number;
  triageMs: number;
  proposalMs: number;
  screeningMs: number;
  kernelMs: number;
  explanationMs: number;
  totalMs: number;
}

/** The analysis as the API returns it. Every field is plain JSON (amounts are strings). */
export interface AnalysisView {
  id: string;
  createdAt: string;
  extracted: Extracted;
  triage: TriageResult;
  proposal: ProposalView;
  kernel: KernelResult;
  screening: Screening;
  verdict: Verdict;
  explanation: Explanation;
  timings: Timings;
}

/**
 * Extraction first (deterministic), then triage, the agent's proposal and screening in parallel, then the
 * kernel on the resulting payment intent, then the verdict, then (for holds) the explanation.
 */
export async function analyzeDocument(deps: AppDeps, text: string): Promise<StoredAnalysis> {
  const clock = stopwatch();
  const extracted = clock.sync("extractMs", () => extractInvoice(text));
  const modelText = normalizeText(text).text;
  const onFile = payeeOnFile(deps, extracted);
  const [triage, proposal, screened] = await Promise.all([
    clock.async("triageMs", async () => deps.triage.triage(buildTriageState(modelText, extracted, await onFile))),
    clock.async("proposalMs", () => propose(deps.llm, modelText)),
    clock.async("screeningMs", () => deps.screening.screen(extracted.addresses)),
  ]);
  const agentProposal = proposal.status === "ok" ? proposalOf(proposal) : null;
  const kernel = await clock.async("kernelMs", () => runKernel(deps.chain, extracted, agentProposal));
  const screening = await screenIntent(deps.screening, screened, kernel.intent, extracted.addresses);
  const verdict = decide({ extracted, kernel: kernel.result, triage, screening, triageRequired: deps.triageRequired });
  const explanation = await clock.async("explanationMs", () => explainOutcome(deps.llm, kernel.result, verdict));
  const view: AnalysisView = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    extracted,
    triage,
    proposal,
    kernel: kernel.result,
    screening,
    verdict,
    explanation,
    timings: clock.done(),
  };
  return { view, intent: kernel.intent, verdict, payment: null };
}

/** The registry record for the document's T-number, which System-1 sees as the vendor master ("payee on file"). */
async function payeeOnFile(deps: AppDeps, extracted: Extracted): Promise<PayeeState | null> {
  const digits = extracted.tNumber?.slice(1);
  if (!digits) return null;
  try {
    return await deps.chain.payee(BigInt(digits));
  } catch (error) {
    // Triage still runs, just without the vendor master; the kernel reports the chain failure itself.
    process.stderr.write(`[agent] payee lookup for triage failed: ${error instanceof Error ? error.name : "error"}\n`);
    return null;
  }
}

async function propose(llm: LlmPort | null, text: string): Promise<ProposalView> {
  if (!llm) {
    return { status: "unavailable", provider: "none", message: "LLM_PROVIDER=none: the payment intent comes from the deterministic extraction" };
  }
  const started = performance.now();
  try {
    const proposal = await llm.propose(text.slice(0, MAX_PROPOSAL_CHARS));
    return { status: "ok", provider: llm.provider, model: llm.model, latencyMs: Math.round(performance.now() - started), ...proposal };
  } catch (error) {
    if (!(error instanceof LlmError)) {
      process.stderr.write(`[agent] proposal failed: ${error instanceof Error ? error.name : "error"}\n`);
    }
    return { status: "unavailable", provider: llm.provider, message: error instanceof LlmError ? error.message : "unexpected error" };
  }
}

function proposalOf(view: Extract<ProposalView, { status: "ok" }>): Proposal {
  const { tNumber, payTo, amount, invoiceNumber, wouldPay, reasoning } = view;
  return { tNumber, payTo, amount, invoiceNumber, wouldPay, reasoning };
}

/** The agent may want to pay an address the document never printed; screen that one too. */
async function screenIntent(
  port: ScreeningPort,
  screened: Screening,
  intent: PaymentIntent | null,
  printed: Address[],
): Promise<Screening> {
  const extra = intent?.payTo;
  if (!extra || printed.includes(extra) || screened.status !== "ok") return screened;
  const more = await port.screen([extra]);
  if (more.status !== "ok") return { ...screened, errors: [...screened.errors, { address: extra, error: more.reason }] };
  return { ...more, results: [...screened.results, ...more.results], errors: [...screened.errors, ...more.errors] };
}

function stopwatch() {
  const started = performance.now();
  const t: Timings = { extractMs: 0, triageMs: 0, proposalMs: 0, screeningMs: 0, kernelMs: 0, explanationMs: 0, totalMs: 0 };
  const since = (from: number) => Math.round(performance.now() - from);
  return {
    sync<T>(key: keyof Timings, run: () => T): T {
      const from = performance.now();
      const value = run();
      t[key] = since(from);
      return value;
    },
    async async<T>(key: keyof Timings, run: () => Promise<T>): Promise<T> {
      const from = performance.now();
      const value = await run();
      t[key] = since(from);
      return value;
    },
    done(): Timings {
      t.totalMs = since(started);
      return t;
    },
  };
}

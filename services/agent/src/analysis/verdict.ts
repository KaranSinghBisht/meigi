import type { Extracted } from "../extract/types.js";
import type { KernelResult } from "../kernel/kernel.js";
import type { Reason } from "../kernel/reasons.js";
import type { Screening } from "../screening/intercepta.js";
import type { TriageResult } from "../triage/triage.js";

export interface Verdict {
  decision: "pay" | "hold";
  reasons: Reason[]; // everything that blocks an automatic payment
  warnings: Reason[];
}

/** Judgement holds: a verified human may release them (World ID for Agents), unlike integrity or chain holds. */
export interface HoldPolicy {
  maxPressure: number; // System-1 pressure above this holds
  autoClearMaxYen: number | null; // amounts above this never auto-clear
}

export const DEFAULT_HOLD_POLICY: HoldPolicy = { maxPressure: 0.5, autoClearMaxYen: null };

export interface VerdictInput {
  extracted: Extracted;
  kernel: KernelResult;
  triage: TriageResult;
  screening: Screening;
  triageRequired: boolean;
  holds: HoldPolicy;
}

/**
 * Pay only when the kernel passed every chain check, the document is unambiguous, System-1 triage
 * auto-clears it and no screened address is flagged. Any one layer can hold; no layer but the kernel can pay.
 */
export function decide(input: VerdictInput): Verdict {
  const tNumber = input.kernel.payee?.tNumber ?? input.extracted.tNumber;
  const legalName = input.kernel.payee?.legalName ?? null;
  const tag = (r: Omit<Reason, "tNumber" | "legalName">): Reason => ({ ...r, tNumber, legalName });
  const all: Reason[] = [
    ...input.extracted.flags.map((flag) => tag({ ...flag, layer: "extraction" })),
    ...input.kernel.reasons,
    ...triageReasons(input.triage, input.triageRequired).map(tag),
    ...judgementHolds(input).map(tag),
    ...screeningReasons(input.screening).map(tag),
  ];
  const reasons = all.filter((r) => r.severity === "block");
  const clear = reasons.length === 0 && input.kernel.status === "checked" && input.kernel.ok;
  return { decision: clear ? "pay" : "hold", reasons, warnings: all.filter((r) => r.severity === "warn") };
}

type Untagged = Omit<Reason, "tNumber" | "legalName">;

function triageReasons(triage: TriageResult, required: boolean): Untagged[] {
  if (triage.status === "unavailable") {
    const tried = triage.attempts.map((a) => `${a.backend}: ${a.error}`).join("; ") || "no backend configured";
    return [
      {
        code: "triage_unavailable",
        severity: required ? "block" : "warn",
        layer: "triage",
        message: `System-1 triage is unavailable (${tried}), so nothing can be auto-cleared.`,
      },
    ];
  }
  // A credit note never pays. PayeeBench counts it as "safe" (not a scam), so the route alone would clear it.
  const creditProbability = triage.requestType.probabilities?.credit_note ?? 0;
  const creditNote: Untagged[] =
    triage.requestType.value === "credit_note" || creditProbability >= 0.3
      ? [{ code: "triage_credit_note", severity: "block", layer: "triage", message: "System-1 reads this as a credit note or refund, which is never paid." }]
      : [];
  if (triage.route === "auto_clear") return creditNote;
  return [
    ...creditNote,
    {
      code: "triage_hold",
      severity: "block",
      layer: "triage",
      message: `System-1 triage (${triage.model ?? triage.backend}) holds it: ${triage.holdReasons.join("; ")}.`,
    },
  ];
}

/**
 * Pressure (System-1's, or an urgency phrase in the document) and amounts above the auto-clear budget hold a
 * payment that would otherwise clear. Neither says the payee is wrong, so a verified human may approve them.
 */
function judgementHolds({ extracted, kernel, triage, holds }: VerdictInput): Untagged[] {
  const out: Untagged[] = [];
  const pressure = triage.status === "ok" && triage.pressure > holds.maxPressure ? triage.pressure : null;
  const urgent = extracted.flags.some((flag) => flag.code === "urgent_language");
  if (pressure !== null || urgent) {
    const why = pressure !== null ? `System-1 pressure ${Math.round(pressure * 100)}%` : "urgent wording";
    // Says why, not who may release it: other holds may rule that out (the console shows `approval.approvable`).
    const message = `This request pushes for a fast payment (${why}).`;
    out.push({ code: "pressure_hold", severity: "block", layer: "triage", message });
  }
  const intent = kernel.intent;
  if (holds.autoClearMaxYen !== null && intent && Number(intent.amount.value) > holds.autoClearMaxYen) {
    const budget = `¥${holds.autoClearMaxYen.toLocaleString("en-US")}`;
    const message = `${intent.amount.display} is above the auto-clear budget of ${budget}.`;
    out.push({ code: "above_auto_clear_budget", severity: "block", layer: "kernel", message });
  }
  return out;
}

function screeningReasons(screening: Screening): Untagged[] {
  if (screening.status === "unavailable") {
    return [{ code: "screening_unavailable", severity: "warn", layer: "screening", message: `Screening unavailable: ${screening.reason}.` }];
  }
  const flagged: Untagged[] = screening.results
    .filter((r) => r.flagged)
    .map((r) => ({
      code: "screening_flagged",
      severity: "block",
      layer: "screening",
      message: `Intercepta flags ${r.address} (toxic score ${r.toxicScore}${r.traits.length ? `; ${r.traits.map((t) => t.name).join(", ")}` : ""}).`,
    }));
  const failed: Untagged[] = screening.errors.map((e) => ({
    code: "screening_error",
    severity: "warn",
    layer: "screening",
    message: `${e.address} was not screened: ${e.error}.`,
  }));
  return [...flagged, ...failed];
}

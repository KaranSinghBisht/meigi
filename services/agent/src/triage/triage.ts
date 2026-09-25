import { z } from "zod";
import { BackendError, type TriageBackend } from "./backends.js";
import { MAX_SAFE_SUSPICION, REQUEST_TYPES, SAFE_TYPES, SUSPICION_LEVELS, TRIAGE_QUESTIONS } from "./questions.js";
import type { TriageState } from "./state.js";

/**
 * Routing rule, identical to PayeeBench's: p_safe = P(type ∈ {routine_invoice, credit_note}) × P(no new
 * destination) × P(suspicion ≤ 1). Auto-clear only when p_safe reaches the threshold (calibrated on the
 * validation split at a 1% error budget). Pressure is reported but never blocks alone: a genuine overdue
 * reminder is urgent, and the kernel still checks the payee.
 */
export const DEFAULT_MIN_P_SAFE = 0.9;

export interface Attempt {
  backend: string;
  code: string;
  error: string;
}

export interface TriageOk {
  status: "ok";
  backend: string;
  model: string | null;
  latencyMs: number;
  requestType: { value: string; confidence: number; probabilities: Record<string, number> | null };
  newDestination: number;
  pressure: number;
  suspicion: { score: number; level: string; probabilities: Record<string, number> | null };
  pSafe: number;
  minPSafe: number;
  route: "auto_clear" | "hold";
  holdReasons: string[];
  attempts: Attempt[]; // backends that failed before this one answered
}

export interface TriageUnavailable {
  status: "unavailable";
  message: "triage unavailable";
  attempts: Attempt[];
}

export type TriageResult = TriageOk | TriageUnavailable;

export interface TriagePort {
  backends: string[];
  triage(state: TriageState): Promise<TriageResult>;
}

const probabilities = z.record(z.string(), z.number().min(0).max(1)).optional();
const answersSchema = z.object({
  model: z.string().regex(/^[\w.:@/-]{1,64}$/u).optional().catch(undefined),
  answers: z.object({
    request_type: z.object({ choice: z.enum(REQUEST_TYPES), confidence: z.number().min(0).max(1), probabilities }),
    new_destination: z.object({ noul: z.number().min(0).max(1) }),
    pressure: z.object({ noul: z.number().min(0).max(1) }),
    suspicion: z.object({ score: z.number().min(0), probabilities }),
  }),
});
type Answers = z.infer<typeof answersSchema>;

/** Tries each backend in order and reports "triage unavailable" if none answers; results are never invented. */
export function createTriage(backends: TriageBackend[], minPSafe = DEFAULT_MIN_P_SAFE): TriagePort {
  return {
    backends: backends.map((backend) => backend.name),
    async triage(state: TriageState): Promise<TriageResult> {
      const attempts: Attempt[] = [];
      for (const backend of backends) {
        const outcome = await askOne(backend, state);
        if ("attempt" in outcome) attempts.push(outcome.attempt);
        else return toResult(backend.name, outcome.answers, { latencyMs: outcome.latencyMs, attempts }, minPSafe);
      }
      return { status: "unavailable", message: "triage unavailable", attempts };
    },
  };
}

async function askOne(backend: TriageBackend, state: TriageState): Promise<{ answers: Answers; latencyMs: number } | { attempt: Attempt }> {
  const started = performance.now();
  try {
    const parsed = answersSchema.safeParse(await backend.ask({ state, questions: TRIAGE_QUESTIONS }));
    if (!parsed.success) return { attempt: { backend: backend.name, code: "bad_response", error: "unexpected answer format" } };
    return { answers: parsed.data, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return { attempt: attemptFrom(backend.name, error) };
  }
}

function toResult(backend: string, data: Answers, meta: { latencyMs: number; attempts: Attempt[] }, minPSafe: number): TriageOk {
  const a = data.answers;
  const level = SUSPICION_LEVELS[Math.min(SUSPICION_LEVELS.length - 1, Math.round(a.suspicion.score))]!;
  const factors = safetyFactors(a);
  const pSafe = factors.type * factors.sameDestination * factors.lowSuspicion;
  const holdReasons = pSafe >= minPSafe ? [] : explainHold(a, factors, pSafe, minPSafe);
  return {
    status: "ok",
    backend,
    model: data.model ?? null,
    ...meta,
    requestType: { value: a.request_type.choice, confidence: a.request_type.confidence, probabilities: a.request_type.probabilities ?? null },
    newDestination: a.new_destination.noul,
    pressure: a.pressure.noul,
    suspicion: { score: a.suspicion.score, level, probabilities: a.suspicion.probabilities ?? null },
    pSafe: round(pSafe),
    minPSafe,
    route: holdReasons.length === 0 ? "auto_clear" : "hold",
    holdReasons,
  };
}

/** The three factors of p_safe. Missing probabilities count against clearing, never for it. */
function safetyFactors(a: Answers["answers"]) {
  const typeProbs = a.request_type.probabilities;
  const type = typeProbs
    ? SAFE_TYPES.reduce((sum, key) => sum + (typeProbs[key] ?? 0), 0)
    : SAFE_TYPES.includes(a.request_type.choice) ? a.request_type.confidence : 0;
  const levels = a.suspicion.probabilities;
  let lowSuspicion = 0;
  if (levels) for (let i = 0; i <= MAX_SAFE_SUSPICION; i++) lowSuspicion += levels[String(i)] ?? 0;
  return { type: Math.min(1, type), sameDestination: 1 - a.new_destination.noul, lowSuspicion: Math.min(1, lowSuspicion) };
}

function explainHold(a: Answers["answers"], f: ReturnType<typeof safetyFactors>, pSafe: number, min: number): string[] {
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const reasons = [`p_safe ${pSafe.toFixed(2)} is below ${min}`];
  if (f.type < 0.9) reasons.push(`request type ${a.request_type.choice} (routine or credit note: ${pct(f.type)})`);
  if (f.sameDestination < 0.9) reasons.push(`asks to pay a new account or wallet (${pct(a.new_destination.noul)})`);
  if (f.lowSuspicion < 0.9) {
    reasons.push(a.suspicion.probabilities ? `suspicion ${a.suspicion.score.toFixed(2)} of 3` : "no suspicion probabilities were returned");
  }
  return reasons;
}

function round(p: number): number {
  return Math.round(p * 10_000) / 10_000;
}

function attemptFrom(backend: string, error: unknown): Attempt {
  if (error instanceof BackendError) return { backend, code: error.code, error: error.message };
  process.stderr.write(`[agent] triage backend ${backend} failed: ${error instanceof Error ? error.name : "error"}\n`);
  return { backend, code: "error", error: "unexpected failure" };
}

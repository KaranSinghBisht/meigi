import { nowSeconds, type AppDeps } from "../deps.js";
import { HttpError } from "../http.js";
import { plannedOutcome, submitOnChain } from "../registry/submit.js";
import type { RegistrationRecord } from "../store/db.js";
import { formatTNumber } from "../tnumber.js";

/** The submit response while a registration waits in the public window. */
export interface QueuedResponse {
  outcome: "pending_public_window";
  tNumber: string; // "T" + 13 digits
  publicId: string; // what GET /registrations/pending lists it under, and what objections name
  submitAfter: number; // unix seconds
}

/** Queues a registration that passed every check; the attester submits it once the window has passed. */
export function queueForWindow(
  deps: AppDeps,
  registration: RegistrationRecord,
  threshold: number,
  hours: number,
): QueuedResponse {
  const submitAfter = nowSeconds(deps) + Math.round(hours * 3600);
  const publicId = deps.store.queueRegistration(registration.id, threshold, submitAfter);
  if (!publicId) throw new HttpError(409, "already_submitted", "this registration is already queued or submitted");
  return { outcome: "pending_public_window", tNumber: formatTNumber(registration.tNumber), publicId, submitAfter };
}

/** A claim older than this was left by a process that stopped mid-write; the registration is retried. */
const STALE_CLAIM_SECONDS = 10 * 60;

/**
 * Submits every queued registration whose window has passed and that nobody objected to. Each one is claimed first,
 * so an objection that lands during the run, or another writer, can't race it. A refusal from the chain's state
 * (e.g. the payee is already disputed) closes it as "failed:<code>"; any other error is retried on the next run.
 */
export async function submitDueRegistrations(deps: AppDeps): Promise<number> {
  deps.store.releaseStaleClaims(nowSeconds(deps) - STALE_CLAIM_SECONDS);
  let submitted = 0;
  for (const registration of deps.store.dueRegistrations(nowSeconds(deps))) {
    if (!deps.store.claimForSubmission(registration.id, nowSeconds(deps))) continue; // objected or taken meanwhile
    try {
      if (registration.threshold === null) throw new HttpError(409, "no_threshold", "queued without a threshold");
      const outcome = await plannedOutcome(deps, registration);
      await submitOnChain(deps, registration, registration.threshold, outcome);
      submitted++;
    } catch (error) {
      if (error instanceof HttpError) deps.store.closeRegistration(registration.id, `failed:${error.code}`);
      else deps.store.releaseClaim(registration.id);
      process.stderr.write(`[verifier] queued ${formatTNumber(registration.tNumber)} not submitted: ${reasonOf(error)}\n`);
    }
  }
  return submitted;
}

/** Runs submitDueRegistrations every `intervalMs`, one run at a time. Returns a function that stops it. */
export function startPendingScheduler(deps: AppDeps, intervalMs = 60_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    submitDueRegistrations(deps)
      .catch((error: unknown) => process.stderr.write(`[verifier] pending window run failed: ${reasonOf(error)}\n`))
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** One line about a failure: viem's short message where there is one, never the multi-line detail (it can hold URLs). */
function reasonOf(error: unknown): string {
  const short = (error as { shortMessage?: unknown } | null)?.shortMessage;
  if (typeof short === "string") return short;
  return error instanceof Error ? (error.message.split("\n")[0] ?? error.name) : "unknown error";
}

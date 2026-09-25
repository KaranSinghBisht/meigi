import { randomUUID } from "node:crypto";
import type { StoredAnalysis } from "../analysis/store.js";
import { HttpError } from "../http.js";
import type { ApproverRegistry } from "./approvers.js";
import { startDevice } from "./device.js";
import { approvalRefusal, bindingOf } from "./holds.js";
import { IdpUnavailable, type Idp } from "./idp.js";
import { pollUntilDone, type Attempt, type PollContext } from "./poller.js";

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired" | "unavailable" | "wrong_human";

/** POST /invoices/:id/approval. Never the device code. */
export interface ApprovalStart {
  attemptId: string;
  userCode: string;
  verificationUriComplete: string;
  expiresAt: number; // unix seconds
  interval: number; // seconds
}

/** GET /invoices/:id/approval. Never the device code, the ID token or the approver's sub. */
export interface ApprovalState {
  attemptId: string;
  status: ApprovalStatus;
  expiresAt: number; // unix seconds: when a pending attempt expires
  used: boolean; // an approval pays at most once
  approvedAt?: number; // unix seconds: the fresh proof's auth_time
  approver?: "enrolled" | "matched";
  reason?: string; // why it is denied, expired, unavailable or wrong_human
}

export interface ApprovalService {
  /** Starts (or, while one is pending for the same snapshot, returns) an attempt; 409 unless approvable. */
  start(stored: StoredAnalysis): Promise<ApprovalStart>;
  status(invoiceId: string): ApprovalState | null;
  /** Spends an approval on one pay attempt, or throws (404 unknown, 409 not approved / used / void). */
  consume(stored: StoredAnalysis, attemptId: string): void;
  /** Resolves when the attempt's poller has stopped (tests). */
  settled(attemptId: string): Promise<void>;
}

export interface ApprovalOptions {
  idp: Idp;
  approvers: ApproverRegistry;
  now?: () => number; // unix seconds
  wait?: (ms: number) => Promise<void>;
}

const MAX_ATTEMPTS = 1_000;

export function createApprovals(opts: ApprovalOptions): ApprovalService {
  const ctx: PollContext = {
    idp: opts.idp,
    approvers: opts.approvers,
    now: opts.now ?? (() => Math.floor(Date.now() / 1000)),
    wait: opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref())),
  };
  const attempts = new Map<string, Attempt>();
  const latest = new Map<string, string>(); // invoice id → its latest attempt id
  const starting = new Map<string, Promise<ApprovalStart>>(); // one device request per invoice at a time
  const current = (invoiceId: string) => attempts.get(latest.get(invoiceId) ?? "");

  async function open(stored: StoredAnalysis): Promise<ApprovalStart> {
    const attempt = await openAttempt(ctx, stored);
    attempts.set(attempt.id, attempt);
    latest.set(attempt.invoiceId, attempt.id);
    evictOldest(attempts, latest);
    return startView(attempt);
  }

  return {
    async start(stored) {
      const refusal = approvalRefusal(stored);
      if (refusal) throw new HttpError(409, "not_approvable", refusal);
      const id = stored.view.id;
      const live = current(id);
      if (live && liveStatus(live, ctx.now()) === "pending" && live.binding === bindingOf(stored)) return startView(live);
      const inFlight = starting.get(id) ?? open(stored).finally(() => starting.delete(id));
      starting.set(id, inFlight);
      return inFlight;
    },
    status(invoiceId) {
      const attempt = current(invoiceId);
      return attempt ? stateView(attempt, ctx.now()) : null;
    },
    consume(stored, attemptId) {
      const attempt = attempts.get(attemptId);
      if (!attempt || attempt.invoiceId !== stored.view.id) throw new HttpError(404, "approval_not_found", "no such approval for this invoice");
      if (attempt.consumed) throw new HttpError(409, "approval_used", "this approval was already used");
      const status = liveStatus(attempt, ctx.now());
      if (status !== "approved") throw new HttpError(409, "approval_not_approved", `the approval is ${status}: nothing was paid`);
      attempt.consumed = true; // single use, whatever happens next
      if (attempt.binding !== bindingOf(stored)) throw new HttpError(409, "approval_void", "the invoice changed after it was approved: nothing was paid");
    },
    settled: async (attemptId) => attempts.get(attemptId)?.done,
  };
}

async function openAttempt(ctx: PollContext, stored: StoredAnalysis): Promise<Attempt> {
  const startedAt = ctx.now(); // before the request: auth_time can't predate the device code
  let device;
  try {
    device = await startDevice(ctx.idp);
  } catch (error) {
    if (error instanceof IdpUnavailable) throw new HttpError(503, "approval_unavailable", error.message);
    throw error;
  }
  const attempt: Attempt = {
    id: randomUUID(),
    invoiceId: stored.view.id,
    binding: bindingOf(stored),
    deviceCode: device.deviceCode,
    userCode: device.userCode,
    verificationUriComplete: device.verificationUriComplete,
    startedAt,
    expiresAt: startedAt + device.expiresIn,
    interval: device.interval,
    status: "pending",
    failures: 0,
    consumed: false,
    done: Promise.resolve(),
  };
  attempt.done = pollUntilDone(ctx, attempt);
  return attempt;
}

function evictOldest(attempts: Map<string, Attempt>, latest: Map<string, string>): void {
  if (attempts.size <= MAX_ATTEMPTS) return;
  const [oldestId, oldest] = attempts.entries().next().value!;
  attempts.delete(oldestId);
  if (latest.get(oldest.invoiceId) === oldestId) latest.delete(oldest.invoiceId);
}

/** A pending attempt past its expiry is expired; an approval unused past its validity is too. */
function liveStatus(attempt: Attempt, now: number): ApprovalStatus {
  if (attempt.status === "pending" && now >= attempt.expiresAt) return "expired";
  if (attempt.status === "approved" && !attempt.consumed && now >= (attempt.validUntil ?? 0)) return "expired";
  return attempt.status;
}

function startView(attempt: Attempt): ApprovalStart {
  return {
    attemptId: attempt.id,
    userCode: attempt.userCode,
    verificationUriComplete: attempt.verificationUriComplete,
    expiresAt: attempt.expiresAt,
    interval: attempt.interval,
  };
}

function stateView(attempt: Attempt, now: number): ApprovalState {
  const status = liveStatus(attempt, now);
  const out: ApprovalState = { attemptId: attempt.id, status, expiresAt: attempt.expiresAt, used: attempt.consumed };
  if (attempt.approvedAt !== undefined) out.approvedAt = attempt.approvedAt;
  if (attempt.approver) out.approver = attempt.approver;
  if (status !== attempt.status) out.reason = attempt.status === "approved" ? "the approval was not used in time" : "nobody approved in time";
  else if (attempt.reason) out.reason = attempt.reason;
  return out;
}

import { createHash, randomUUID } from "node:crypto";
import type { StoredAnalysis } from "../analysis/store.js";
import { HttpError } from "../http.js";
import type { ApproverRegistry } from "./approvers.js";
import { startDevice } from "./device.js";
import { approvalRefusal, bindingOf } from "./holds.js";
import { IdpUnavailable, type Idp } from "./idp.js";
import { abandon, pollUntilDone, type Attempt, type PollContext } from "./poller.js";
import { traceIdToken } from "./trace.js";

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
  /**
   * Starts (or, while one is pending for the same snapshot, returns) an attempt. 409 unless approvable; 429 when
   * too many attempts are live or this invoice started one less than an interval ago.
   */
  start(stored: StoredAnalysis): Promise<ApprovalStart>;
  status(invoiceId: string): ApprovalState | null;
  /**
   * Spends an approval on one pay attempt, or throws (404 unknown, 409 not approved / used / void). Returns the
   * approving ID token for the signer, once: it is dropped from memory as it is handed over.
   */
  consume(stored: StoredAnalysis, attemptId: string): { idToken: string };
  /** Resolves when the attempt's poller has stopped (tests). */
  settled(attemptId: string): Promise<void>;
}

/** Where approval steps are recorded (the audit log). Must not throw: a failed write is the recorder's to report. */
export type ApprovalRecorder = (event: "approval.started" | "approval.settled", fields: Record<string, unknown>) => void;

export interface ApprovalOptions {
  idp: Idp;
  approvers: ApproverRegistry;
  record?: ApprovalRecorder;
  now?: () => number; // unix seconds
  wait?: (ms: number) => Promise<void>;
  limits?: { maxAttempts?: number; maxLive?: number };
  trace?: boolean; // WORLD_AGENTS_TRACE
}

/** Attempts kept in memory; the oldest is dropped (and its poller stopped) beyond this. */
const MAX_ATTEMPTS = 1_000;
/** Background pollers running at once; each attempt has one until it stops. */
const MAX_LIVE_POLLERS = 8;

export function createApprovals(opts: ApprovalOptions): ApprovalService {
  const ctx: PollContext = {
    idp: opts.idp,
    approvers: opts.approvers,
    now: opts.now ?? (() => Math.floor(Date.now() / 1000)),
    wait: opts.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms).unref())),
  };
  const { issuer, clientId } = opts.idp;
  if (opts.trace) ctx.trace = (idToken, startedAt) => traceIdToken(idToken, { issuer, clientId, startedAt });
  const limits = { maxAttempts: opts.limits?.maxAttempts ?? MAX_ATTEMPTS, maxLive: opts.limits?.maxLive ?? MAX_LIVE_POLLERS };
  return new Approvals(ctx, limits, opts.record ?? (() => {}));
}

class Approvals implements ApprovalService {
  private readonly attempts = new Map<string, Attempt>();
  private readonly latest = new Map<string, string>(); // invoice id → its latest attempt id
  private readonly starting = new Map<string, Promise<ApprovalStart>>(); // one device request per invoice at a time
  private live = 0; // running pollers, plus device requests in flight

  constructor(
    private readonly ctx: PollContext,
    private readonly limits: { maxAttempts: number; maxLive: number },
    private readonly record: ApprovalRecorder,
  ) {}

  async start(stored: StoredAnalysis): Promise<ApprovalStart> {
    const refusal = approvalRefusal(stored);
    if (refusal) throw new HttpError(409, "not_approvable", refusal);
    const id = stored.view.id;
    const last = this.current(id);
    if (last && liveStatus(last, this.ctx.now()) === "pending" && last.binding === bindingOf(stored)) return startView(last);
    const inFlight = this.starting.get(id);
    if (inFlight) return inFlight;
    this.throttle(last);
    const opening = this.open(stored).finally(() => this.starting.delete(id));
    this.starting.set(id, opening);
    return opening;
  }

  status(invoiceId: string): ApprovalState | null {
    const attempt = this.current(invoiceId);
    return attempt ? stateView(attempt, this.ctx.now()) : null;
  }

  consume(stored: StoredAnalysis, attemptId: string): { idToken: string } {
    const attempt = this.attempts.get(attemptId);
    if (!attempt || attempt.invoiceId !== stored.view.id) throw new HttpError(404, "approval_not_found", "no such approval for this invoice");
    if (attempt.consumed) throw new HttpError(409, "approval_used", "this approval was already used");
    const status = liveStatus(attempt, this.ctx.now());
    if (status !== "approved") throw new HttpError(409, "approval_not_approved", `the approval is ${status}: nothing was paid`);
    attempt.consumed = true; // single use, whatever happens next
    const idToken = attempt.idToken;
    delete attempt.idToken;
    if (attempt.binding !== bindingOf(stored)) throw new HttpError(409, "approval_void", "the invoice changed after it was approved: nothing was paid");
    if (!idToken) throw new HttpError(409, "approval_not_approved", "the approval has no proof to show the signer: nothing was paid");
    return { idToken };
  }

  async settled(attemptId: string): Promise<void> {
    await this.attempts.get(attemptId)?.done;
  }

  private current(invoiceId: string): Attempt | undefined {
    return this.attempts.get(this.latest.get(invoiceId) ?? "");
  }

  /** A global cap on live pollers, and one new attempt per invoice per interval. */
  private throttle(last: Attempt | undefined): void {
    if (last && this.ctx.now() < last.startedAt + last.interval) {
      throw new HttpError(429, "approval_too_soon", "an approval for this invoice was just requested; try again in a few seconds");
    }
    if (this.live >= this.limits.maxLive) throw new HttpError(429, "approval_busy", "too many approvals are waiting; try again when one finishes");
  }

  private async open(stored: StoredAnalysis): Promise<ApprovalStart> {
    this.live += 1;
    let attempt: Attempt;
    try {
      attempt = await openAttempt(this.ctx, stored);
    } catch (error) {
      this.live -= 1;
      throw error;
    }
    this.record("approval.started", { approvalId: attempt.id, analysisId: attempt.invoiceId, bindingSha256: sha256Hex(attempt.binding), expiresAt: attempt.expiresAt });
    void attempt.done.finally(() => {
      this.live -= 1;
      this.record("approval.settled", settledFields(attempt));
    });
    this.attempts.set(attempt.id, attempt);
    this.latest.set(attempt.invoiceId, attempt.id);
    evictOldest(this.attempts, this.latest, this.limits.maxAttempts);
    return startView(attempt);
  }
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

function evictOldest(attempts: Map<string, Attempt>, latest: Map<string, string>, max: number): void {
  if (attempts.size <= max) return;
  const [oldestId, oldest] = attempts.entries().next().value!;
  attempts.delete(oldestId);
  if (latest.get(oldest.invoiceId) === oldestId) latest.delete(oldest.invoiceId);
  abandon(oldest); // a pending one's poller stops at its next step
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** How an attempt ended, for the audit log: never its device or user code. */
function settledFields(attempt: Attempt): Record<string, unknown> {
  return {
    approvalId: attempt.id,
    analysisId: attempt.invoiceId,
    status: attempt.status,
    ...(attempt.reason ? { reason: attempt.reason } : {}),
    ...(attempt.approvedAt !== undefined ? { approvedAt: attempt.approvedAt, approver: attempt.approver, approverId: attempt.approverId } : {}),
  };
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

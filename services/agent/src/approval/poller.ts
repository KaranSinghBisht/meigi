import { createHash } from "node:crypto";
import type { ApprovalStatus } from "./approvals.js";
import type { ApproverCheck, ApproverRegistry } from "./approvers.js";
import { pollOnce, type Poll } from "./device.js";
import { IdpUnavailable, type Idp } from "./idp.js";
import { TokenRejected, validateIdToken } from "./token.js";

/** An approval must be spent within this long of the proof being checked: it approves this moment, not a day. */
export const APPROVAL_TTL_SECONDS = 10 * 60;
/** Consecutive unreachable polls (5xx, timeouts) before the attempt stops as unavailable, backing off between. */
const MAX_FAILURES = 3;

export interface Attempt {
  id: string;
  invoiceId: string;
  binding: string;
  deviceCode: string; // server-side only; cleared once the attempt stops
  userCode: string;
  verificationUriComplete: string;
  startedAt: number; // unix seconds
  expiresAt: number;
  interval: number; // seconds
  status: ApprovalStatus;
  reason?: string;
  failures: number;
  approvedAt?: number; // auth_time
  validUntil?: number;
  approver?: Exclude<ApproverCheck, "wrong_human">;
  approverId?: string; // the first 16 hex of SHA-256(sub): who approved, for the audit log, without the sub itself
  idToken?: string; // the validated approval, server-side only: handed to the signer once, then dropped
  consumed: boolean;
  done: Promise<void>;
}

export interface PollContext {
  idp: Idp;
  approvers: ApproverRegistry;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  trace?: (idToken: string, startedAt: number) => void; // WORLD_AGENTS_TRACE: the token's shape, never its values
}

/**
 * Polls at `interval` (+5 s per slow_down) until a terminal state, never past the device code's expiry, and stops
 * as soon as the attempt is stopped from outside (evicted).
 */
export async function pollUntilDone(ctx: PollContext, attempt: Attempt): Promise<void> {
  try {
    while (attempt.status === "pending") {
      await ctx.wait(attempt.interval * 1000);
      if (attempt.status !== "pending") return;
      if (ctx.now() >= attempt.expiresAt) return finish(attempt, "expired", "nobody approved in time");
      const result = await pollOnce(ctx.idp, attempt.deviceCode);
      if (attempt.status === "pending") await apply(ctx, attempt, result);
    }
  } catch (error) {
    process.stderr.write(`[agent] approval poller failed: ${error instanceof Error ? error.name : "error"}\n`);
    finish(attempt, "unavailable", "the approval check failed");
  }
}

async function apply(ctx: PollContext, attempt: Attempt, result: Poll): Promise<void> {
  if (result.kind !== "unavailable") attempt.failures = 0;
  switch (result.kind) {
    case "pending":
      return;
    case "slow_down":
      attempt.interval += 5;
      return;
    case "unavailable":
      attempt.failures += 1;
      if (attempt.failures >= MAX_FAILURES) return finish(attempt, "unavailable", result.reason);
      attempt.interval = Math.min(attempt.interval * 2, 60);
      return;
    case "expired":
      return finish(attempt, "expired", "nobody approved in time");
    case "denied":
      return finish(attempt, "denied", result.reason);
    case "approved":
      return approve(ctx, attempt, result.idToken);
  }
}

/** The IdP says approved: only a valid, fresh, Orb-level token from the right human makes it so here. */
async function approve(ctx: PollContext, attempt: Attempt, idToken: string): Promise<void> {
  try {
    const { idp } = ctx;
    const now = ctx.now();
    ctx.trace?.(idToken, attempt.startedAt);
    const context = { keys: await idp.keys(), issuer: idp.issuer, clientId: idp.clientId, startedAt: attempt.startedAt, now };
    const { sub, authTime } = await validateIdToken(idToken, context);
    const check = ctx.approvers.check(sub);
    if (check === "wrong_human") return finish(attempt, "wrong_human", "a different person proved than the approver on file");
    attempt.approvedAt = authTime;
    attempt.validUntil = now + APPROVAL_TTL_SECONDS;
    attempt.approver = check;
    attempt.approverId = createHash("sha256").update(sub).digest("hex").slice(0, 16);
    attempt.idToken = idToken;
    finish(attempt, "approved");
  } catch (error) {
    if (error instanceof TokenRejected) return finish(attempt, "denied", `invalid token: ${error.message}`);
    if (error instanceof IdpUnavailable) return finish(attempt, "unavailable", error.message);
    throw error;
  }
}

/** Stops a pending attempt from outside: its poller exits at its next step. */
export function abandon(attempt: Attempt): void {
  finish(attempt, "expired", "the approval request was dropped");
}

function finish(attempt: Attempt, status: ApprovalStatus, reason?: string): void {
  if (attempt.status !== "pending") return; // terminal states are final
  attempt.status = status;
  if (reason) attempt.reason = reason;
  attempt.deviceCode = ""; // redeemed or dead: don't keep it
}

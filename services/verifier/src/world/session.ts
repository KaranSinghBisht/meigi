import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { keccak256, toBytes, type Hex } from "viem";

/**
 * World ID 4.0 sessions for company officers. Enrollment creates a session once; every later approval proves
 * that same session. Uniqueness proofs are one-time per action, so sessions are the documented way to check
 * "is this the same human as before?".
 */

const VERIFY_URL = "https://developer.world.org/api/v4/verify";
const SESSION_ID = /^session_[0-9a-f]{128}$/u;

export type WorldEnvironment = "production" | "staging" | "sandbox";

/** What IDKit needs from our backend to open a request. Session requests are signed without an action. */
export interface RpContext {
  sig: string;
  nonce: string;
  created_at: number;
  expires_at: number;
}

export interface VerifiedSession {
  sessionId: string;
  officerId: Hex; // what the registry stores: keccak256(session_id)
  sessionNullifier: string; // per-proof replay protection
}

export class WorldVerificationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WorldVerificationError";
  }
}

export function createRpContext(signingKeyHex: string): RpContext {
  const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex });
  return { sig, nonce, created_at: createdAt, expires_at: expiresAt };
}

export function officerIdFor(sessionId: string): Hex {
  return keccak256(toBytes(sessionId));
}

/** Forwards the IDKit result unchanged to World's verifier and returns the proven session. */
export async function verifySessionProof(
  rpId: string,
  result: unknown,
  environment: WorldEnvironment,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<VerifiedSession> {
  const response = await fetchImpl(`${VERIFY_URL}/${encodeURIComponent(rpId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(result),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || body.success !== true) {
    const code = typeof body.code === "string" ? body.code : `http_${response.status}`;
    throw new WorldVerificationError(code, typeof body.detail === "string" ? body.detail : "verification failed");
  }
  if (body.environment !== environment) {
    throw new WorldVerificationError("environment_mismatch", `expected ${environment}, got ${String(body.environment)}`);
  }
  const sessionId = body.session_id;
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) {
    throw new WorldVerificationError("not_a_session", "the proof is not a World ID session proof");
  }
  return { sessionId, officerId: officerIdFor(sessionId), sessionNullifier: sessionNullifierOf(result) };
}

/**
 * Requires the proof to carry `signal`, so a proof made for one change can't approve another. The signal is
 * part of the zero-knowledge proof that World verifies; this checks it is the one we asked for.
 */
export function requireSignal(result: unknown, signal: string): void {
  const expected = hashSignal(signal).toLowerCase();
  const actual = firstResponse(result)?.signal_hash;
  if (typeof actual !== "string" || actual.toLowerCase() !== expected) {
    throw new WorldVerificationError("signal_mismatch", "the proof was made for a different request");
  }
}

function firstResponse(result: unknown): { session_nullifier?: unknown; signal_hash?: unknown } | undefined {
  const responses = (result as { responses?: unknown } | null)?.responses;
  return Array.isArray(responses) ? (responses[0] as { session_nullifier?: unknown }) : undefined;
}

/** The per-proof nullifier IDKit returns as `responses[].session_nullifier = [nullifier, action]`. */
function sessionNullifierOf(result: unknown): string {
  const pair = firstResponse(result)?.session_nullifier;
  if (!Array.isArray(pair) || typeof pair[0] !== "string") {
    throw new WorldVerificationError("missing_session_nullifier", "the proof carries no session nullifier");
  }
  return pair[0];
}

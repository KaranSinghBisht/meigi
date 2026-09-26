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

/** The exact `rp_context` object IDKit takes. */
export interface IdkitRpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export function toIdkitRpContext(rpId: string, rp: RpContext): IdkitRpContext {
  return { rp_id: rpId, nonce: rp.nonce, created_at: rp.created_at, expires_at: rp.expires_at, signature: rp.sig };
}

export interface VerifiedSession {
  sessionId: string;
  officerId: Hex; // what the registry stores: keccak256(session_id)
  sessionNullifier: string; // per-proof replay protection
  /** Self Check's z-score for this proof, if it used Self Check; undefined for any other credential (Proof of
   * Human, Passport, MNC). A risk signal from the issuer, not a uniqueness verdict - never gated on. */
  sybilScore?: number;
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
  return {
    sessionId,
    officerId: officerIdFor(sessionId),
    sessionNullifier: sessionNullifierOf(result),
    sybilScore: sybilScoreOf(result),
  };
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

/** The World ID credentials an officer may prove with: Proof of Human (Orb), or Selfie Check (phone only). */
export type OfficerCredential = "proof_of_human" | "selfie";
export const OFFICER_CREDENTIALS: readonly OfficerCredential[] = ["proof_of_human", "selfie"];

/** IDKit's own numeric credential-issuer schema id per credential label (`@worldcoin/idkit-core`'s response
 * types: 1 = proof_of_human, 11 = selfie - passport is 9303 and mnc is 9310, neither accepted here). Checked
 * alongside `identifier` in `requireCredential` so the human-readable label and its numeric schema id must
 * agree, rather than trusting the label alone. */
const ISSUER_SCHEMA_ID: Readonly<Record<OfficerCredential, number>> = { proof_of_human: 1, selfie: 11 };

/**
 * Requires every credential in the proof to be one this verifier accepts for officers, so a client can't swap in a
 * weaker credential than the deployment chose. World verifies the proof itself; this checks what was proven,
 * pinning both the credential label (`identifier`) and its numeric schema id (`issuer_schema_id`) so a proof
 * can't carry an allowed label next to a schema id that doesn't match it.
 */
export function requireCredential(result: unknown, allowed: ReadonlySet<string>): void {
  const responses = (result as { responses?: unknown } | null)?.responses;
  const items = Array.isArray(responses) ? responses : [];
  const valid =
    items.length > 0 &&
    items.every((response) => {
      const identifier = (response as { identifier?: unknown })?.identifier;
      if (typeof identifier !== "string" || !allowed.has(identifier)) return false;
      const issuerSchemaId = (response as { issuer_schema_id?: unknown })?.issuer_schema_id;
      return issuerSchemaId === ISSUER_SCHEMA_ID[identifier as OfficerCredential];
    });
  if (!valid) {
    throw new WorldVerificationError("credential_not_allowed", "this World ID credential is not accepted for officers");
  }
}

function firstResponse(
  result: unknown,
): { session_nullifier?: unknown; signal_hash?: unknown; identifier?: unknown; sybil_score?: unknown } | undefined {
  const responses = (result as { responses?: unknown } | null)?.responses;
  return Array.isArray(responses) ? (responses[0] as Record<string, unknown>) : undefined;
}

/**
 * Self Check's z-score for this proof, if it used Self Check (`identifier === "selfie"`); undefined for any
 * other credential, which carries no such field. World documents it as a risk signal, not a uniqueness
 * verdict - store and show it, but never gate on it.
 */
export function sybilScoreOf(result: unknown): number | undefined {
  const response = firstResponse(result);
  if (response?.identifier !== "selfie") return undefined;
  return typeof response.sybil_score === "number" ? response.sybil_score : undefined;
}

/** The per-proof nullifier IDKit returns as `responses[].session_nullifier = [nullifier, action]`. */
function sessionNullifierOf(result: unknown): string {
  const pair = firstResponse(result)?.session_nullifier;
  if (!Array.isArray(pair) || typeof pair[0] !== "string") {
    throw new WorldVerificationError("missing_session_nullifier", "the proof carries no session nullifier");
  }
  return pair[0];
}

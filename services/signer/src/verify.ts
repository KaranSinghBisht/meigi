import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Hex } from "viem";
import { z } from "zod";
import { ORB_ACR } from "./policy.js";

/**
 * Phase 2 (SIGNER_VERIFY_APPROVAL=1): the signer checks a human's approval itself instead of taking the agent's
 * word for it. The approval is a World ID for Agents ID token, and it must be:
 * - in canonical compact form, and signed by the provider's keys (RS256; discovery and keys come from the issuer's
 *   own origin, with no redirects);
 * - from WORLD_AGENTS_ISSUER, for WORLD_AGENTS_CLIENT_ID alone, unexpired, Orb-level, made within `maxAgeS`, and
 *   made after this signer started (spent approvals live in memory, so a restart must not revive them);
 * - from an approver (see approversFrom);
 * - unspent: it is reserved for the first invoice it pays, (T-number, invoiceRef) as the vault identifies it, in
 *   the same step as the check, so concurrent requests can't share it. That invoice may present it again.
 * It does not know which payment the human meant: the device grant carries no binding, so the agent binds it.
 */

const SKEW_S = 60;
const COMPACT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

export interface VerifierOptions {
  issuer: string;
  clientId: string;
  isApprover: (sub: string) => boolean;
  maxAgeS: number;
  now: () => number; // unix seconds
  startedAt?: number; // unix seconds; approvals made before it are refused. Defaults to now()
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** The vault's identity for an invoice. */
export interface Invoice {
  tNumber: bigint;
  invoiceRef: Hex;
}

/**
 * `reason` completes "…, and the one presented …". `approverId` is the first 16 hex of SHA-256(sub), as the agent
 * logs it. `release` frees a reservation this check made, for when nothing was broadcast.
 */
export type Verdict = { ok: true; approverId: string; release: () => void } | { ok: false; reason: string };

export interface ApprovalVerifier {
  verify(idToken: string, invoice: Invoice): Promise<Verdict>;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** header.payload, what the provider signed, or null when the token isn't in canonical form (a re-spelt signature). */
function signedPart(idToken: string): string | null {
  if (!COMPACT.test(idToken)) return null;
  const [header, payload, signature] = idToken.split(".") as [string, string, string];
  return Buffer.from(signature, "base64url").toString("base64url") === signature ? `${header}.${payload}` : null;
}

export function createApprovalVerifier(opts: VerifierOptions): ApprovalVerifier {
  const keys = providerKeys(opts);
  const startedAt = opts.startedAt ?? opts.now();
  const reserved = new Map<string, { invoice: string; until: number }>(); // SHA-256 of header.payload → its invoice
  const forget = () => {
    for (const [id, use] of reserved) if (use.until < opts.now()) reserved.delete(id);
  };
  return {
    async verify(idToken, invoice) {
      const signed = signedPart(idToken);
      if (!signed) return { ok: false, reason: "is not a valid ID token" };
      const checked = await checkToken(idToken, await keys(), opts);
      if (!checked.ok) return checked;
      if (checked.authTime <= startedAt + SKEW_S) return { ok: false, reason: "was made before this signer started; approve again" };
      if (!opts.isApprover(checked.sub)) return { ok: false, reason: "is from someone who is not an approver" };
      // No await from here on: checking and reserving are one step.
      forget();
      const id = sha256(signed);
      const key = `${invoice.tNumber}:${invoice.invoiceRef.toLowerCase()}`;
      const held = reserved.get(id);
      if (held && held.invoice !== key) return { ok: false, reason: "was already spent on another payment" };
      if (!held) reserved.set(id, { invoice: key, until: Math.min(checked.exp, checked.authTime + opts.maxAgeS) + SKEW_S });
      const release = () => {
        if (!held) reserved.delete(id);
      };
      return { ok: true, approverId: sha256(checked.sub).slice(0, 16), release };
    },
  };
}

type Checked = { ok: true; sub: string; authTime: number; exp: number } | { ok: false; reason: string };

async function checkToken(idToken: string, keys: JWTVerifyGetKey | null, opts: VerifierOptions): Promise<Checked> {
  if (!keys) return { ok: false, reason: "could not be checked: the World ID provider's keys are unreachable" };
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, {
      issuer: opts.issuer,
      audience: opts.clientId,
      algorithms: ["RS256"],
      clockTolerance: SKEW_S,
      currentDate: new Date(opts.now() * 1000),
      requiredClaims: ["exp", "iat", "sub", "auth_time"],
    }));
  } catch (error) {
    return { ok: false, reason: rejection(error) };
  }
  const { aud, acr, auth_time: authTime, sub, exp } = payload;
  if (!(aud === opts.clientId || (Array.isArray(aud) && aud.length === 1 && aud[0] === opts.clientId))) return { ok: false, reason: "is for other clients too" };
  if (acr !== ORB_ACR) return { ok: false, reason: "is not an Orb-verified World ID" };
  if (typeof authTime !== "number" || typeof exp !== "number" || typeof sub !== "string" || !sub) return { ok: false, reason: "has no usable auth_time or subject" };
  const age = opts.now() - authTime;
  if (age > opts.maxAgeS + SKEW_S) return { ok: false, reason: `is more than ${Math.round(opts.maxAgeS / 60)} minutes old` };
  if (age < -SKEW_S) return { ok: false, reason: "is dated in the future" };
  return { ok: true, sub, authTime, exp };
}

function rejection(error: unknown): string {
  if (error instanceof errors.JWTExpired) return "has expired";
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "iss") return "is from another issuer";
    if (error.claim === "aud") return "is for another client";
    return error.reason === "missing" ? `has no ${error.claim}` : `has an unacceptable ${error.claim}`;
  }
  if (error instanceof errors.JWSInvalid || error instanceof errors.JWTInvalid) return "is not a valid ID token";
  const unsigned = [errors.JWSSignatureVerificationFailed, errors.JWKSNoMatchingKey, errors.JOSEAlgNotAllowed];
  if (unsigned.some((kind) => error instanceof kind)) return "is not signed by the World ID provider";
  return "could not be checked: the World ID provider's keys are unreachable";
}

const discovery = z.object({ issuer: z.string(), jwks_uri: z.url() });

/**
 * The provider's signing keys, from its discovery document: both on the issuer's own origin, fetched without
 * redirects. Null (logged) while they can't be loaded; the next approval tries again.
 */
function providerKeys(opts: VerifierOptions): () => Promise<JWTVerifyGetKey | null> {
  const doFetch: typeof fetch = (input, init) => (opts.fetch ?? fetch)(input, { ...init, redirect: "error" });
  const timeoutMs = opts.timeoutMs ?? 10_000;
  let keys: Promise<JWTVerifyGetKey> | null = null;
  const load = async () => {
    const response = await doFetch(`${opts.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(timeoutMs) });
    const doc = discovery.parse(await response.json());
    if (!response.ok || doc.issuer !== opts.issuer || new URL(doc.jwks_uri).origin !== new URL(opts.issuer).origin) {
      throw new Error("the provider's discovery document is unusable");
    }
    return createRemoteJWKSet(new URL(doc.jwks_uri), { [customFetch]: doFetch, timeoutDuration: timeoutMs });
  };
  return async () => {
    keys ??= load();
    try {
      return await keys;
    } catch (error) {
      keys = null;
      process.stderr.write(`[signer] the World ID provider's keys could not be loaded: ${error instanceof Error ? error.name : "error"}\n`);
      return null;
    }
  };
}

const approverFile = z.object({ version: z.literal(1), subs: z.array(z.string().min(1)) });

export interface ApproverSources {
  signerOnly: string; // SIGNER_APPROVERS (.env.signer): when set, the only approvers
  pinned: string; // WORLD_AGENTS_APPROVERS, as the agent reads it
  enrolledPath: string; // the agent's approver file
}

/**
 * Who may approve. SIGNER_APPROVERS, set in the signer's own .env.signer, is the only list when present: nothing the
 * agent writes can add to it. Without it, the signer follows the agent: WORLD_AGENTS_APPROVERS (matched exactly)
 * and whoever is enrolled in the agent's approver file, read afresh each time. An unreadable file adds nobody.
 */
export function approversFrom(sources: ApproverSources): (sub: string) => boolean {
  const list = (value: string) => new Set(value.split(",").map((sub) => sub.trim()).filter(Boolean));
  const own = list(sources.signerOnly);
  if (own.size > 0) return (sub) => own.has(sub);
  const pinned = list(sources.pinned);
  return (sub) => {
    if (pinned.has(sub)) return true;
    if (!existsSync(sources.enrolledPath)) return false;
    try {
      return approverFile.parse(JSON.parse(readFileSync(sources.enrolledPath, "utf8"))).subs.includes(sub);
    } catch (error) {
      process.stderr.write(`[signer] approver file unreadable: ${error instanceof Error ? error.name : "error"}\n`);
      return false;
    }
  };
}

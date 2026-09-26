import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { Hex } from "viem";
import { z } from "zod";
import { ORB_ACR } from "./policy.js";

/**
 * Phase 2 (SIGNER_VERIFY_APPROVAL=1): the signer checks a human's approval itself instead of taking the agent's
 * word for it. The approval is a World ID for Agents ID token, and it must be:
 * - signed by the provider's keys (RS256; discovery and keys come from the issuer's own origin, with no redirects);
 * - from WORLD_AGENTS_ISSUER, for WORLD_AGENTS_CLIENT_ID alone, unexpired, Orb-level, and made within `maxAgeS`;
 * - from an approver: a subject in WORLD_AGENTS_APPROVERS or enrolled in the agent's approver file (read only);
 * - unspent: once a payment it approved is sent, it approves no other invoice. The same invoice may present it
 *   again, and gets the transaction already in flight. Spent approvals are kept in memory for their freshness window.
 */

const SKEW_S = 60;

export interface VerifierOptions {
  issuer: string;
  clientId: string;
  isApprover: (sub: string) => boolean;
  maxAgeS: number;
  now: () => number; // unix seconds
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** `reason` completes "…, and the one presented …". `approverId` is the first 16 hex of SHA-256(sub), as the agent logs it. */
export type Verdict = { ok: true; approverId: string } | { ok: false; reason: string };

export interface ApprovalVerifier {
  verify(idToken: string, invoiceRef: Hex): Promise<Verdict>;
  /** The payment it approved was sent: from now on it approves only that invoice. */
  spend(idToken: string, invoiceRef: Hex): void;
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function createApprovalVerifier(opts: VerifierOptions): ApprovalVerifier {
  const keys = providerKeys(opts);
  const spent = new Map<string, { invoiceRef: Hex; until: number }>(); // SHA-256 of the token → the invoice it paid
  const forget = () => {
    for (const [id, use] of spent) if (use.until < opts.now()) spent.delete(id);
  };
  return {
    async verify(idToken, invoiceRef) {
      forget();
      const use = spent.get(sha256(idToken));
      if (use && use.invoiceRef !== invoiceRef) return { ok: false, reason: "was already spent on another payment" };
      const providerKeys = await keys().catch((error: unknown) => {
        process.stderr.write(`[signer] the World ID provider's keys could not be loaded: ${error instanceof Error ? error.name : "error"}\n`);
        return null;
      });
      const checked = await checkToken(idToken, providerKeys, opts);
      if (!checked.ok) return checked;
      if (!opts.isApprover(checked.sub)) return { ok: false, reason: "is from someone who is not an approver" };
      return { ok: true, approverId: sha256(checked.sub).slice(0, 16) };
    },
    spend(idToken, invoiceRef) {
      spent.set(sha256(idToken), { invoiceRef, until: opts.now() + opts.maxAgeS + SKEW_S });
    },
  };
}

async function checkToken(idToken: string, keys: JWTVerifyGetKey | null, opts: VerifierOptions): Promise<{ ok: true; sub: string } | { ok: false; reason: string }> {
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
  const { aud, acr, auth_time: authTime, sub } = payload;
  if (!(aud === opts.clientId || (Array.isArray(aud) && aud.length === 1 && aud[0] === opts.clientId))) return { ok: false, reason: "is for other clients too" };
  if (acr !== ORB_ACR) return { ok: false, reason: "is not an Orb-verified World ID" };
  if (typeof authTime !== "number" || typeof sub !== "string" || !sub) return { ok: false, reason: "has no usable auth_time or subject" };
  const age = opts.now() - authTime;
  if (age > opts.maxAgeS + SKEW_S) return { ok: false, reason: `is more than ${Math.round(opts.maxAgeS / 60)} minutes old` };
  if (age < -SKEW_S) return { ok: false, reason: "is dated in the future" };
  return { ok: true, sub };
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

/** The provider's signing keys, from its discovery document: both on the issuer's own origin, fetched without redirects. */
function providerKeys(opts: VerifierOptions): () => Promise<JWTVerifyGetKey> {
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
  return () => {
    keys ??= load().catch((error: unknown) => {
      keys = null; // retried on the next approval
      throw error;
    });
    return keys;
  };
}

const approverFile = z.object({ version: z.literal(1), subs: z.array(z.string().min(1)) });

/**
 * Who may approve, as the agent sees it: WORLD_AGENTS_APPROVERS (matched exactly) and whoever is enrolled in the
 * agent's approver file, read afresh each time. An unreadable file approves nobody beyond the pinned subjects.
 */
export function approversFrom(pinned: string, path: string): (sub: string) => boolean {
  const allowed = new Set(pinned.split(",").map((sub) => sub.trim()).filter(Boolean));
  return (sub) => {
    if (allowed.has(sub)) return true;
    if (!existsSync(path)) return false;
    try {
      return approverFile.parse(JSON.parse(readFileSync(path, "utf8"))).subs.includes(sub);
    } catch (error) {
      process.stderr.write(`[signer] approver file unreadable: ${error instanceof Error ? error.name : "error"}\n`);
      return false;
    }
  };
}

import { decodeJwt } from "jose";

/**
 * The signer's own rule, whatever the agent decided: a payment above the ceiling needs a verified human's approval.
 *
 * Phase 1 (SIGNER_VERIFY_APPROVAL=0) checks the approval the agent forwards (a World ID for Agents ID token):
 * present, an Orb-level World ID, made within the last `maxAgeS` seconds, and from the configured issuer and client.
 * It trusts the agent to have verified the token's signature and the approver. Phase 2 (verify.ts) checks those
 * here too, and spends each approval on one payment.
 */

export const ORB_ACR = "https://world.org/oidc/acr/orb-v3";
const SKEW_S = 60;

export interface Approval {
  idToken: string;
}

export interface Policy {
  ceilingUnits: bigint; // SIGNER_HUMAN_ABOVE_YEN in token units
  ceilingYen: number;
  maxAgeS: number;
  now: () => number; // unix seconds
  issuer?: string | undefined;
  clientId?: string | undefined;
}

/** "a payment above ¥150,000 needs a verified human's approval": the start of every refusal. */
export function ceilingRule(policy: Pick<Policy, "ceilingYen">): string {
  return `a payment above ¥${policy.ceilingYen.toLocaleString("en-US")} needs a verified human's approval`;
}

/** Phase 1: why this payment may not be signed, or null when it may. */
export function approvalRefusal(amount: bigint, approval: Approval | undefined, policy: Policy): string | null {
  if (amount <= policy.ceilingUnits) return null;
  const above = ceilingRule(policy);
  if (!approval) return above;
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwt(approval.idToken);
  } catch {
    return `${above}, and the one presented is not a JWT`;
  }
  if (claims.acr !== ORB_ACR) return `${above}, and the one presented is not an Orb-verified World ID`;
  if (typeof claims.auth_time !== "number") return `${above}, and the one presented has no auth_time`;
  const age = policy.now() - claims.auth_time;
  if (age > policy.maxAgeS + SKEW_S) return `${above}, and the one presented is more than ${Math.round(policy.maxAgeS / 60)} minutes old`;
  if (age < -SKEW_S) return `${above}, and the one presented is dated in the future`;
  if (policy.issuer && claims.iss !== policy.issuer) return `${above}, and the one presented is from another issuer`;
  if (policy.clientId && !audienceIncludes(claims.aud, policy.clientId)) return `${above}, and the one presented is for another client`;
  return null;
}

function audienceIncludes(aud: unknown, clientId: string): boolean {
  return aud === clientId || (Array.isArray(aud) && aud.includes(clientId));
}

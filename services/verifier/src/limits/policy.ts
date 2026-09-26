import type { AppDeps } from "../deps.js";

/**
 * Off-chain limits against first-claim squatting and dispute griefing. A T-number and its exact legal name are
 * public, so the verifier caps how much any one human (World ID session) and any one client can claim.
 */
export interface Policy {
  /** Distinct companies one World ID officer may be an officer of (open, queued or submitted claims). */
  officerCompanyLimit: number;
  /** Hours an unsubmitted registration stays open; after that it expires and no longer counts. */
  openRegistrationHours: number;
  /** Hours a non-fixture registration waits in the public window before the attester submits it (0 = at once). */
  pendingHours: number;
  /** Per-client-IP requests per hour; 0 turns a limit off. */
  ratePerHour: {
    registrations: number;
    disputes: number;
    objections: number;
    /** POST /registrations/:id/domain: triggers a real outbound DNS/HTTPS fetch to the registration's own domain. */
    domain: number;
    nta: number;
    payees: number;
    /** GET /lei/:lei: proxies GLEIF, a third party we don't want to hammer on a caller's behalf either. */
    lei: number;
    rpContext: number;
  };
}

export const DEFAULT_POLICY: Policy = {
  officerCompanyLimit: 3,
  openRegistrationHours: 24,
  pendingHours: 0,
  ratePerHour: {
    registrations: 10,
    disputes: 3,
    objections: 10,
    domain: 20,
    nta: 120,
    payees: 60,
    lei: 30,
    rpContext: 120,
  },
};

export function policyOf(deps: AppDeps): Policy {
  const p = deps.policy ?? {};
  return { ...DEFAULT_POLICY, ...p, ratePerHour: { ...DEFAULT_POLICY.ratePerHour, ...p.ratePerHour } };
}

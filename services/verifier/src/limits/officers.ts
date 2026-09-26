import type { AppDeps } from "../deps.js";
import { isFixture } from "../fixtures.js";
import { HttpError } from "../http.js";
import type { RegistrationRecord } from "../store/db.js";
import { isClosed } from "../store/records.js";
import { formatTNumber } from "../tnumber.js";
import type { Policy } from "./policy.js";

/** The registry's own cap on officers per company (OfficerQuorum): more would make the on-chain write revert. */
export const MAX_OFFICERS = 8;

/** Never submitted, queued or being submitted, and older than the open window: it no longer counts. */
export function isExpired(r: RegistrationRecord, policy: Policy, now: number): boolean {
  const idle = r.outcome === null && r.submitAfter === null && r.claimedAt === null;
  return idle && now - r.createdAt > policy.openRegistrationHours * 3600;
}

/** Why an officer's other claim on the same T-number blocks a new one, or null if it doesn't. */
function blockingClaim(r: RegistrationRecord): string | null {
  if (r.outcome === "disputed") return "a claim under dispute";
  if (r.outcome !== null) return null;
  if (r.review === "objected") return "a registration held for review";
  if (r.submitAfter !== null) return "a registration waiting in the public window";
  return "an unfinished registration (finish it, or wait until it expires)";
}

/**
 * Per-human limits, checked when a World ID officer enrolls in `registration`. Fictional fixtures (office 9999)
 * neither count nor are limited, so demos can repeat.
 * - One officer has at most one claim per T-number that is open, queued, held or disputed: no parallel or repeated
 *   second claims.
 * - One officer is an officer of at most `officerCompanyLimit` companies, counting every live claim.
 */
export function checkOfficerLimits(
  deps: AppDeps,
  registration: RegistrationRecord,
  officerId: string,
  policy: Policy,
  now: number,
): void {
  if (isFixture(deps, registration.tNumber)) return;
  const others = deps.store
    .registrationsOfOfficer(officerId)
    .filter((r) => r.id !== registration.id && !isFixture(deps, r.tNumber))
    .filter((r) => !isClosed(r) && !isExpired(r, policy, now));
  const tNumber = formatTNumber(registration.tNumber);
  const blocking = others.filter((r) => r.tNumber === registration.tNumber).map(blockingClaim).find(Boolean);
  if (blocking) {
    const message = `This World ID already has ${blocking} for ${tNumber}.`;
    throw new HttpError(409, "duplicate_open_registration", message);
  }
  const companies = new Set(others.map((r) => r.tNumber));
  if (!companies.has(registration.tNumber) && companies.size >= policy.officerCompanyLimit) {
    const message = `One World ID can be an officer of at most ${policy.officerCompanyLimit} companies.`;
    throw new HttpError(409, "officer_limit", message);
  }
}

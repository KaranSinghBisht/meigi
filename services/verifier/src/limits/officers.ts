import type { AppDeps } from "../deps.js";
import { isFixture } from "../fixtures.js";
import { HttpError } from "../http.js";
import type { RegistrationRecord } from "../store/db.js";
import { formatTNumber } from "../tnumber.js";
import type { Policy } from "./policy.js";

/** Never submitted, never queued, and older than the open window: it no longer counts and can't be submitted. */
export function isExpired(r: RegistrationRecord, policy: Policy, now: number): boolean {
  return r.outcome === null && r.submitAfter === null && now - r.createdAt > policy.openRegistrationHours * 3600;
}

/**
 * Per-human limits, checked when a World ID officer enrolls in `registration`. Fictional fixtures (office 9999)
 * neither count nor are limited, so demos can repeat.
 * - One officer has at most one open (unsubmitted or queued) registration per T-number: no parallel second claims.
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
    .filter((r) => r.id !== registration.id && !isFixture(deps, r.tNumber) && !isExpired(r, policy, now));
  const tNumber = formatTNumber(registration.tNumber);
  if (others.some((r) => r.tNumber === registration.tNumber && r.outcome === null)) {
    const message = `This World ID already has an unfinished registration for ${tNumber}. Finish that one, or wait until it expires.`;
    throw new HttpError(409, "duplicate_open_registration", message);
  }
  const companies = new Set(others.map((r) => r.tNumber));
  if (!companies.has(registration.tNumber) && companies.size >= policy.officerCompanyLimit) {
    const message = `One World ID can be an officer of at most ${policy.officerCompanyLimit} companies.`;
    throw new HttpError(409, "officer_limit", message);
  }
}

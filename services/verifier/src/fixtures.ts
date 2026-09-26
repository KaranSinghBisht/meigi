import type { AppDeps } from "./deps.js";
import { hasCorporateCheckDigit, isUnassignableOffice } from "./tnumber.js";

/** A fictional demo company: fixtures enabled, and a number no real company can hold. */
export function isFixture(deps: AppDeps, digits: string): boolean {
  return deps.fixtures === true && isUnassignableOffice(digits) && hasCorporateCheckDigit(digits);
}

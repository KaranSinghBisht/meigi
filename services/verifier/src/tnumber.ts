/** Japanese qualified-invoice registration numbers: "T" + 13 digits. */

const T_NUMBER = /^T?(\d{13})$/;

/** Parses "T2011001234567" / "t2011001234567" / "2011001234567" into its 13 digits, or null. */
export function parseTNumber(input: string): string | null {
  const match = T_NUMBER.exec(input.trim().toUpperCase());
  return match?.[1] ?? null;
}

/**
 * 法人番号 check digit: check = 9 − (Σ Pn·Qn mod 9), where Pn is the n-th digit of the 12-digit base
 * counted from the right and Qn is 1 for odd n, 2 for even n. Sole-proprietor T-numbers are assigned
 * separately, so a failing check means "not a corporate number", not necessarily "invalid".
 */
export function hasCorporateCheckDigit(digits: string): boolean {
  if (!/^\d{13}$/.test(digits)) return false;
  const base = digits.slice(1);
  let sum = 0;
  for (let n = 1; n <= 12; n++) {
    sum += Number(base[base.length - n]) * (n % 2 === 1 ? 1 : 2);
  }
  return Number(digits[0]) === 9 - (sum % 9);
}

/**
 * Registry-office code 9999 is never issued (none of the 5.79M numbers in the NTA index uses it), so a number with it
 * can't belong to a real company: the only numbers the verifier may treat as fictional demo fixtures.
 */
export function isUnassignableOffice(digits: string): boolean {
  return /^\d{13}$/.test(digits) && digits.slice(1, 5) === "9999";
}

export function formatTNumber(digits: string): string {
  return `T${digits}`;
}

/** The registry stores T-numbers as the 13 digits in a uint64. */
export function toChainId(digits: string): bigint {
  return BigInt(digits);
}

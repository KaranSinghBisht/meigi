/** Japanese qualified-invoice registration numbers (登録番号): "T" + 13 digits (T + 法人番号 for companies). */

// "T2011001234567", "t2011001234567.payee.eth", "T-2011001234567"; never 13 digits cut out of a longer number.
const T_NUMBER = /(?<![0-9A-Za-z])[Tt][- ]?(\d{13})(?!\d)/gu;
// "登録番号: 2011001234567" also counts when the label is explicit.
const LABELED = /(?:登録番号|registration\s*(?:no\.?|number))\s*(?:[:：#]\s*)?(?:[Tt][- ]?)?(\d{13})(?!\d)/giu;

export interface TNumberHit {
  digits: string;
  index: number;
}

/** Every T-number in the text, distinct, in document order. */
export function findTNumbers(text: string): TNumberHit[] {
  const hits: TNumberHit[] = [];
  for (const pattern of [T_NUMBER, LABELED]) {
    for (const match of text.matchAll(pattern)) {
      hits.push({ digits: match[1]!, index: match.index ?? 0 });
    }
  }
  hits.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  return hits.filter((hit) => (seen.has(hit.digits) ? false : (seen.add(hit.digits), true)));
}

/** Parses "T2011001234567" / "t2011001234567" / "2011001234567" into its 13 digits, or null. */
export function parseTNumber(input: string): string | null {
  const match = /^[Tt]?[- ]?(\d{13})$/u.exec(input.normalize("NFKC").trim());
  return match?.[1] ?? null;
}

/**
 * 法人番号 check digit: check = 9 − (Σ Pn·Qn mod 9), where Pn is the n-th digit of the 12-digit base
 * counted from the right and Qn is 1 for odd n, 2 for even n. Sole-proprietor T-numbers are assigned
 * separately, so a failing check means "not a corporate number", not necessarily "invalid".
 */
export function hasCorporateCheckDigit(digits: string): boolean {
  if (!/^\d{13}$/u.test(digits)) return false;
  const base = digits.slice(1);
  let sum = 0;
  for (let n = 1; n <= 12; n++) {
    sum += Number(base[base.length - n]) * (n % 2 === 1 ? 1 : 2);
  }
  return Number(digits[0]) === 9 - (sum % 9);
}

export function formatTNumber(digits: string): string {
  return `T${digits}`;
}

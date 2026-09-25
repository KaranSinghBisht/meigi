/** Invoice numbers, the issuing company's printed name, and credit-note detection. */

const INVOICE_NUMBER =
  /(?:返還請求書番号|適格返還請求書番号|請求書番号|請求番号|請求書\s*No\.?|伝票番号|invoice\s*(?:no\.?|number|#)|credit\s*note\s*(?:no\.?|number|#))\s*(?:[:：#]\s*)?([A-Za-z0-9](?:[A-Za-z0-9\-_/.]{0,38}[A-Za-z0-9])?)/giu;

// Refund, return or credit wording anywhere makes a document a credit note, which is never paid. Position
// doesn't matter: a refund notice needn't say so in its title, and a false hold is cheap.
const CREDIT =
  /(返還|返金|返品|返戻|払い?戻|赤伝|クレジットノート|credit\s*(?:note|memo)|\brefund(?:s|ed|ing)?\b|\breimburs|\brepay(?:s|ment|ing)?\b|\bcredit(?:ed)?\s+(?:to|back)\b)/iu;
// A payable document asks for payment in its visible text: a bill (請求), an invoice or an amount due.
const BILL = /(請求|invoice|amount\s+due|payment\s+due|total\s+due|balance\s+due|\bbill(?:ed|ing)?\b|payment\s+request)/iu;

const JP_ENTITY = "株式会社|合同会社|有限会社|合資会社|合名会社|一般社団法人|一般財団法人";
const STOP = String.raw`\s、。,:()「」<>\[\]【】`;
const JP_COMPANY = new RegExp(
  String.raw`(?:${JP_ENTITY})\s?[^${STOP}]{1,30}|[^${STOP}]{1,30}(?:${JP_ENTITY})`,
  "gu",
);
const EN_COMPANY =
  /\b[A-Z][A-Za-z0-9&'.-]{0,40}(?:[ \t]{1,3}[A-Z][A-Za-z0-9&'.-]{0,40}){0,5},?[ \t]{1,3}(?:Co\.,?\s*Ltd\.?|K\.K\.|G\.K\.|Inc\.?|LLC|Corporation|Corp\.?)/gu;
// Names on these lines belong to the recipient, not the issuer.
const RECIPIENT_LINE = /(御中|様|宛|殿|\bto\s*:|\bbill\s+to\b|\battn\b|\bdear\b)/iu;

/** Every invoice number, distinct, in document order. Values must contain a digit ("the invoice number is…" doesn't count). */
export function findInvoiceNumbers(text: string): string[] {
  const numbers: string[] = [];
  for (const match of text.matchAll(INVOICE_NUMBER)) {
    const value = match[1]!;
    if (/\d/u.test(value) && !numbers.includes(value)) numbers.push(value);
  }
  return numbers;
}

export function looksLikeCreditNote(text: string): boolean {
  return CREDIT.test(text);
}

export function asksForPayment(visibleText: string): boolean {
  return BILL.test(visibleText);
}

/**
 * The company name printed closest to the issuer's T-number (the issuer prints both together), skipping
 * lines addressed to the recipient. Only used to warn when it differs from the registered name.
 */
export function findClaimedName(text: string, tNumberLine: number | null): string | null {
  const candidates = companyNames(text);
  if (candidates.length === 0) return null;
  if (tNumberLine === null) return candidates[0]!.name;
  const nearest = [...candidates].sort((a, b) => Math.abs(a.line - tNumberLine) - Math.abs(b.line - tNumberLine))[0]!;
  return Math.abs(nearest.line - tNumberLine) <= 3 ? nearest.name : candidates[0]!.name;
}

function companyNames(text: string): { name: string; line: number }[] {
  const names: { name: string; line: number }[] = [];
  text.split("\n").forEach((line, index) => {
    if (RECIPIENT_LINE.test(line)) return;
    for (const pattern of [JP_COMPANY, EN_COMPANY]) {
      for (const match of line.matchAll(pattern)) names.push({ name: match[0].trim(), line: index });
    }
  });
  return names;
}

/** The comparison key for legal names: width-folded, whitespace removed (the verifier's exact-match rule). */
export function nameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, "");
}

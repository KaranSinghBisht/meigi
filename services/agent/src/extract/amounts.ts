import { fromScaled, toScaled } from "./money.js";

/** One amount printed in the document, with a currency marker (¥, 円, JPY or JPYC). */
export interface AmountHit {
  value: string; // signed decimal yen
  raw: string;
  index: number;
  line: number;
}

export interface AmountScan {
  hits: AmountHit[];
  truncated: boolean; // more than MAX_HITS amounts: the document is not a plausible invoice
}

/** Past this many amounts the scan stops (and the caller holds): no real invoice prints hundreds of prices. */
export const MAX_HITS = 400;

// Digit runs are bounded so hostile 64 KB inputs stay linear.
const NUM = String.raw`\d[\d,]{0,24}(?:\.\d{1,18})?`;
const INT = String.raw`\d[\d,]{0,24}`;
// Japanese compounds: 1億2,000万円, 13万2000円, 1万5千円, 480万円, or a plain 132,000. Used behind (?=\d),
// so it can never match empty and swallow a currency marker the next amount needs.
const JP_NUM = String.raw`(?:${NUM}億)?(?:${NUM}万)?(?:${INT}千)?(?:${NUM})?`;

// Negatives: ▲/△/マイナス (Japanese accounting, may be followed by a space), or a minus sign touching the
// amount ("-¥22,000"), in any dash spelling (‐ ‑ ‒ – — ﹣ −). A free-standing dash ("保守費用 - ¥10,000") is a
// separator, not a sign.
const AMOUNT = new RegExp(
  String.raw`(?<neg>[▲△]\s?|マイナス\s?|[-‐‑‒–—﹣−](?=[¥\dJ]))?(?:(?<cur>¥|JPYC|JPY)\s?(?<n1>(?=\d)${JP_NUM})|(?<n2>(?=\d)${JP_NUM})\s?(?<unit>円|JPYC|JPY))`,
  "gu",
);
const COMPOUND = /^(?:([\d,.]+)億)?(?:([\d,.]+)万)?(?:([\d,]+)千)?([\d,.]+)?$/u;

export function findAmounts(text: string): AmountScan {
  const hits: AmountHit[] = [];
  let line = 0;
  let scanned = 0;
  for (const match of text.matchAll(AMOUNT)) {
    const groups = match.groups ?? {};
    const scaled = parseJapaneseNumber(groups.n1 ?? groups.n2 ?? "");
    if (scaled === null) continue;
    if (hits.length === MAX_HITS) return { hits, truncated: true };
    const index = match.index ?? 0;
    for (; scanned < index; scanned++) if (text.charCodeAt(scanned) === 10) line++;
    const end = index + match[0].length;
    // Accounting style "(¥22,000)" is negative too.
    const negative = Boolean(groups.neg) || (text[index - 1] === "(" && text[end] === ")");
    hits.push({ value: fromScaled(negative ? -scaled : scaled), raw: match[0].trim(), index, line });
  }
  return { hits, truncated: false };
}

/** "13万2000" → 132000, "1万5千" → 15000, "1.5億" → 150000000 (as an 18-decimal scaled bigint); null if not a number. */
export function parseJapaneseNumber(text: string): bigint | null {
  const m = COMPOUND.exec(text);
  if (!text || !m) return null;
  try {
    const part = (digits: string | undefined, multiplier: bigint) => (digits ? toScaled(digits.replace(/,/gu, "")) * multiplier : 0n);
    return part(m[1], 100_000_000n) + part(m[2], 10_000n) + part(m[3], 1_000n) + part(m[4], 1n);
  } catch {
    return null; // e.g. "1.2.3": not a number, so not an amount
  }
}

/** Parses a free-form amount such as "132000", "¥132,000", "132,000円" or "13万2000円" into decimal yen. */
export function parseAmount(input: string): string | null {
  const text = input.normalize("NFKC").trim();
  if (/^-?\d{1,25}(?:\.\d{1,18})?$/u.test(text)) return fromScaled(toScaled(text));
  const { hits } = findAmounts(text);
  if (hits.length === 1) return hits[0]!.value;
  const bare = /^(?:¥|JPYC|JPY)?\s?(\d[\d,]{0,24}(?:\.\d{1,18})?)$/u.exec(text);
  return bare ? fromScaled(toScaled(bare[1]!.replace(/,/gu, ""))) : null;
}

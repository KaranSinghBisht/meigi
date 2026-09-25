import type { AmountHit } from "./amounts.js";
import { distinctMoney, fromScaled, money, sumMoney, toScaled } from "./money.js";
import type { Flag, Money, Totals } from "./types.js";

/**
 * Reads the totals block of an invoice (請求金額 / 小計 / 消費税 / line items / adjustments) and checks that it
 * adds up. A labelled amount-due line is never skipped: its single amount is the total, and anything that
 * can't be read that way, or doesn't reconcile, is blocked as ambiguous rather than guessed.
 */

const TOTAL_STRONG =
  /(差引ご?請求金額|ご?請求金額|ご?請求額|お?支払(?:い)?金額|お?振込金額|合計金額|返還金額|返金額|amount\s+due|total\s+due|balance\s+due|grand\s+total)/iu;
const TOTAL = /(合計|総額|\btotal\b)/iu;
const SUBTOTAL = /(小計|税抜|本体価格|sub-?total|net\s+amount)/iu;
const TAX_INCLUDED = /(内消費税|内税|うち消費税|tax\s+included|incl\.?\s+tax)/iu;
// The marker labels an amount only when it immediately precedes it ("（うち消費税 ¥12,000）", "内消費税: ¥12,000").
const TAX_INCLUDED_LABEL = /(?:内消費税|内税|うち消費税|tax\s+included|incl\.?\s+tax)\s*[:：]?\s*$/iu;
const TAX = /(消費税|税額|\btax\b|\bvat\b)/iu;
// Printed deductions that explain a total below subtotal + tax (an advance, a discount, an offset).
const ADJUSTMENT = /(前受|充当|値引|割引|相殺|差引(?!ご?請求)|調整|discount|deduct|advance|adjustment|credit\s+applied)/iu;
const ITEM =
  /(\d{1,6}\s{0,3}(?:個|式|件|点|本|枚|台|時間|ヶ月|か月|ヵ月|人月|名|回|セット|ライセンス|pcs?\b|units?\b|hrs?\b|hours?\b)|(?<![0-9A-Za-z])[x×*]\s*[¥\d]|数量|単価|\bqty\b|@\s*[¥\d])/iu;

type Kind = "strong" | "total" | "subtotal" | "tax" | "item" | "adjustment" | "tax_included";

interface Assignment {
  kind: Kind;
  amount: Money | null;
}

export interface TotalsResult {
  totals: Totals;
  flags: Flag[];
}

export function computeTotals(text: string, hits: AmountHit[]): TotalsResult {
  const lines = text.split("\n");
  const starts: number[] = [];
  lines.reduce((offset, line) => (starts.push(offset), offset + line.length + 1), 0);
  const flags: Flag[] = [];
  const assignments = groupByLine(hits).flatMap(([line, amounts]) => assign(lines[line] ?? "", starts[line] ?? 0, amounts, flags));
  const pick = (kind: Kind) => assignments.filter((a) => a.kind === kind && a.amount).map((a) => a.amount!);
  const totalsFound = [...pick("strong"), ...pick("total")];
  const taxes = pick("tax");
  const lineItems = pick("item");
  const totals: Totals = {
    total: totalsFound[0] ?? null,
    subtotal: pick("subtotal")[0] ?? null,
    tax: taxes.length > 0 ? sumMoney(taxes) : null,
    lineItems,
    lineItemsSum: lineItems.length > 0 ? sumMoney(lineItems) : null,
  };
  const deductions = pick("adjustment").reduce((sum, m) => sum + abs(toScaled(m.value)), 0n);
  const taxIncluded = assignments.some((a) => a.kind === "tax_included");
  return { totals, flags: [...flags, ...totalConflicts(totalsFound), ...consistency(totals, taxIncluded, deductions)] };
}

function groupByLine(hits: AmountHit[]): [number, AmountHit[]][] {
  const byLine = new Map<number, AmountHit[]>();
  for (const hit of hits) {
    const list = byLine.get(hit.line);
    if (list) list.push(hit);
    else byLine.set(hit.line, [hit]);
  }
  return [...byLine.entries()];
}

/** Which role each amount on a line plays. Labels are checked from most to least specific. */
function assign(line: string, lineStart: number, amounts: AmountHit[], flags: Flag[]): Assignment[] {
  const strong = TOTAL_STRONG.test(line);
  if (strong || TOTAL.test(line)) {
    const total = totalOnLine(line, lineStart, amounts);
    if (!total) {
      flags.push({ code: "amount_ambiguous", severity: "block", message: "A total line prints several candidate amounts." });
      return [];
    }
    return [{ kind: strong ? "strong" : "total", amount: total }, ...(TAX_INCLUDED.test(line) ? [{ kind: "tax_included" as const, amount: null }] : [])];
  }
  const first = money(amounts[0]!.value);
  const last = money(amounts.at(-1)!.value);
  if (SUBTOTAL.test(line)) {
    return amounts.length >= 2 && TAX.test(line)
      ? [{ kind: "subtotal", amount: first }, { kind: "tax", amount: last }]
      : [{ kind: "subtotal", amount: first }];
  }
  if (TAX_INCLUDED.test(line)) return [{ kind: "tax_included", amount: null }];
  if (TAX.test(line)) return [{ kind: "tax", amount: last }];
  if (ADJUSTMENT.test(line)) return [{ kind: "adjustment", amount: last }];
  if (ITEM.test(line)) return [{ kind: "item", amount: last }];
  return [];
}

/**
 * The total on a total line: its only amount. The one exception is a tax-included figure printed with it
 * ("¥132,000（うち消費税 ¥12,000）", "合計 (内消費税 ¥12,000) ¥132,000"): with exactly two amounts, exactly one
 * immediately preceded by a うち/内消費税 marker, the other is the total. A marker anywhere else (e.g. a leading
 * "内消費税込") labels nothing. Anything else (a previous balance, a shipping line, a computation) is null:
 * ambiguous, and blocked by the caller.
 */
export function totalOnLine(line: string, lineStart: number, amounts: AmountHit[]): Money | null {
  if (amounts.length === 1) return money(amounts[0]!.value);
  if (amounts.length !== 2) return null;
  const introducedByTaxIncluded = amounts.map((hit, i) => {
    const from = i === 0 ? 0 : amounts[0]!.index - lineStart + amounts[0]!.raw.length;
    return TAX_INCLUDED_LABEL.test(line.slice(Math.max(0, from), hit.index - lineStart));
  });
  if (introducedByTaxIncluded.filter(Boolean).length !== 1) return null;
  return money(amounts[introducedByTaxIncluded[0] ? 1 : 0]!.value);
}

function totalConflicts(totals: Money[]): Flag[] {
  const distinct = distinctMoney(totals);
  if (distinct.length <= 1) return [];
  const listed = distinct.map((m) => m.display).join(", ");
  return [{ code: "multiple_totals", severity: "block", message: `The document states different totals: ${listed}.` }];
}

/** subtotal + tax − printed deductions must equal the total, and line items must equal the subtotal. */
function consistency(t: Totals, taxIncluded: boolean, deductions: bigint): Flag[] {
  const flags: Flag[] = [];
  const mismatch = (message: string) => flags.push({ code: "amount_mismatch", severity: "block", message });
  const tax = t.tax && !taxIncluded ? toScaled(t.tax.value) : 0n;
  const less = deductions > 0n ? ` less ${money(fromScaled(deductions)).display} of deductions` : "";
  if (t.total && t.subtotal) {
    if (toScaled(t.subtotal.value) + tax - deductions !== toScaled(t.total.value)) {
      mismatch(`Subtotal ${t.subtotal.display}${t.tax ? ` plus tax ${t.tax.display}` : ""}${less} doesn't equal the total ${t.total.display}.`);
    }
  }
  if (!t.lineItemsSum) return flags;
  const items = toScaled(t.lineItemsSum.value);
  if (t.subtotal) {
    if (items !== toScaled(t.subtotal.value)) {
      mismatch(`Line items add up to ${t.lineItemsSum.display}, but the subtotal says ${t.subtotal.display}.`);
    }
  } else if (t.total) {
    const total = toScaled(t.total.value);
    if (items - deductions !== total && items + tax - deductions !== total) {
      mismatch(`Line items add up to ${t.lineItemsSum.display}${less}, but the total says ${t.total.display}.`);
    }
  }
  return flags;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

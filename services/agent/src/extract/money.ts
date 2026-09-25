import { formatUnits, parseUnits } from "viem";
import type { Money } from "./types.js";

/** Fixed-point scale for adding yen amounts exactly (independent of the token's decimals). */
const SCALE = 18;

export function toScaled(value: string): bigint {
  return parseUnits(value, SCALE);
}

export function fromScaled(scaled: bigint): string {
  return formatUnits(scaled, SCALE);
}

export function money(value: string): Money {
  return { value, display: formatYen(value) };
}

export function sumMoney(values: Money[]): Money {
  return money(fromScaled(values.reduce((sum, m) => sum + toScaled(m.value), 0n)));
}

export function sameAmount(a: Money, b: Money): boolean {
  return toScaled(a.value) === toScaled(b.value);
}

/** "132000" → "¥132,000"; "-22000" → "-¥22,000"; "0.5" → "¥0.5". Linear in the number of digits. */
export function formatYen(value: string): string {
  const negative = value.startsWith("-");
  const [whole = "0", fraction] = (negative ? value.slice(1) : value).split(".");
  const groups: string[] = [];
  for (let end = whole.length; end > 0; end -= 3) groups.unshift(whole.slice(Math.max(0, end - 3), end));
  return `${negative ? "-" : ""}¥${groups.join(",") || "0"}${fraction ? `.${fraction}` : ""}`;
}

/** Distinct amounts, first occurrence kept (a Set, so thousands of amounts stay linear). */
export function distinctMoney(values: Money[]): Money[] {
  const seen = new Set<string>();
  return values.filter((m) => {
    const key = toScaled(m.value).toString();
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

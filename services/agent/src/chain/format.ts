import { formatUnits } from "viem";
import { formatYen } from "../extract/money.js";

/** Token units → "¥132,000" (JPYC is 1 token = 1 yen). */
export function formatTokenYen(units: bigint, decimals: number): string {
  return formatYen(formatUnits(units, decimals));
}

/** "0xa1c4Da…5C3b"-style short form: the characters people actually compare. */
export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/** Short forms for two addresses, falling back to the full ones when the short forms would look identical. */
export function distinctShort(a: string, b: string): [string, string] {
  const [x, y] = [shortAddress(a), shortAddress(b)];
  return x.toLowerCase() === y.toLowerCase() ? [a, b] : [x, y];
}

/** "T2011001234567 = 株式会社メイギ商事", or just the T-number when the registry has no name for it. */
export function payeeLabel(tNumber: bigint | string, legalName: string | null): string {
  const t = `T${tNumber.toString().replace(/^T/u, "")}`;
  return legalName ? `${t} = ${legalName}` : t;
}

export function isoTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");
}

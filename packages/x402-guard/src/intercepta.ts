import type { Address } from "viem";
import type { ScreenResult } from "./check.js";

/**
 * Intercepta (Web3 Antivirus) quick-scan of a counterparty address. The key has a small request budget, so
 * results are cached per address for the life of the process. Screening covers mainnet activity: a
 * testnet-only address is simply unknown to it.
 */
const QUICK_SCAN = "https://api.web3antivirus.io/api/public/v2/extension/account";

export interface InterceptaOptions {
  apiKey: string;
  /** toxicScore at or above this is flagged (0-100). */
  threshold?: number;
  fetch?: typeof fetch;
}

export function interceptaScreen(options: InterceptaOptions): (address: Address) => Promise<ScreenResult> {
  const cache = new Map<string, Promise<ScreenResult>>();
  const doFetch = options.fetch ?? globalThis.fetch;
  const threshold = options.threshold ?? 70;

  async function scan(address: Address): Promise<ScreenResult> {
    const response = await doFetch(`${QUICK_SCAN}/${address}/quick-scan`, {
      headers: { "X-API-KEY": options.apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`intercepta quick-scan failed with HTTP ${response.status}`);
    const body = (await response.json()) as { toxicScore?: unknown; traits?: unknown };
    const score = typeof body.toxicScore === "number" ? body.toxicScore : 0;
    const traits = Array.isArray(body.traits) ? body.traits.map((t) => (typeof t === "string" ? t : JSON.stringify(t))) : [];
    return { flagged: score >= threshold, summary: `toxicScore ${score}${traits.length ? `: ${traits.join(", ")}` : ""}` };
  }

  return (address) => {
    const key = address.toLowerCase();
    let pending = cache.get(key);
    if (!pending) {
      pending = scan(address);
      pending.catch(() => cache.delete(key)); // never cache a failure
      cache.set(key, pending);
    }
    return pending;
  };
}

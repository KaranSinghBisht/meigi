import type { Address } from "viem";
import { z } from "zod";
import type { CachedScan, ScanCache, Trait } from "./cache.js";

/**
 * Intercepta (Web3 Antivirus) address screening: `GET /api/public/v2/extension/account/{address}/quick-scan`
 * returns a toxic score and risk traits. It is advisory: a flagged address holds the payment, but a clean
 * one never overrides the registry. With no key or no budget left it reports "screening unavailable".
 */

const API = "https://api.web3antivirus.io/api/public/v2/extension/account";
/**
 * Flagged from toxicScore 50, or on any trait an AP payee should never carry. Stricter than @meigi/x402-guard
 * (70, score only) on purpose: a false hold costs a human glance, a missed one costs the payment.
 */
const DEFAULT_TOXIC_THRESHOLD = 50;
const SEVERE_TRAITS = new Set([
  "known_scammer",
  "initiator_scam_transactions",
  "sanction_address",
  "sanction_address_communication",
  "blacklist",
  "fake_phishing_transfer",
  "fake_phishing_contract_communication",
  "rug_pull",
  "rug_pull_trader",
  "mixer_transfers",
  "suspicious_deployer",
  "suspicious_dex_pair_deployer",
]);

const quickScan = z.object({
  toxicScore: z.coerce.number(),
  traits: z
    .array(
      z.object({
        // Trait names are shown to people and models: keep them identifier-shaped instead of rejecting the scan.
        name: z.string().transform((name) => name.replace(/[^A-Za-z0-9_]/gu, "_").slice(0, 64) || "unknown"),
        risk: z.number().nullish(),
        txsCount: z.number().nullish(),
        description: z.string().nullish(),
      }),
    )
    .nullish(),
});

export interface ScanResult extends CachedScan {
  address: Address;
  flagged: boolean;
  cached: boolean;
}

export type Screening =
  | { status: "ok"; results: ScanResult[]; errors: { address: Address; error: string }[]; callsUsed: number; callBudget: number }
  | { status: "unavailable"; message: "screening unavailable"; reason: string };

export interface ScreeningPort {
  enabled: boolean;
  screen(addresses: Address[]): Promise<Screening>;
}

export interface InterceptaOptions {
  apiKey: string | undefined;
  cache: ScanCache;
  maxCalls: number;
  maxPerRequest?: number;
  toxicThreshold?: number;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export function createIntercepta(opts: InterceptaOptions): ScreeningPort {
  return {
    enabled: Boolean(opts.apiKey),
    async screen(addresses) {
      if (!opts.apiKey) return unavailable("no INTERCEPTA_API_KEY is configured");
      const unique = [...new Set(addresses)];
      const limit = opts.maxPerRequest ?? 3;
      const distinct = unique.slice(0, limit);
      const results: ScanResult[] = [];
      const errors = unique.slice(limit).map((address) => ({ address, error: `not screened: over ${limit} addresses per document` }));
      for (const address of distinct) {
        const outcome = await scanOne(opts, opts.apiKey, address);
        if ("error" in outcome) errors.push({ address, error: outcome.error });
        else results.push(outcome);
      }
      if (results.length === 0 && errors.length > 0) return unavailable(errors[0]!.error);
      return { status: "ok", results, errors, callsUsed: opts.cache.calls(), callBudget: opts.maxCalls };
    },
  };
}

async function scanOne(opts: InterceptaOptions, apiKey: string, address: Address): Promise<ScanResult | { error: string }> {
  const cached = opts.cache.get(address);
  const threshold = opts.toxicThreshold ?? DEFAULT_TOXIC_THRESHOLD;
  if (cached) return result(address, cached, true, threshold);
  if (opts.cache.calls() >= opts.maxCalls) return { error: `the ${opts.maxCalls}-call screening budget is used up` };
  opts.cache.recordCall();
  let response: Response;
  try {
    response = await (opts.fetch ?? fetch)(`${API}/${encodeURIComponent(address)}/quick-scan`, {
      headers: { "X-API-KEY": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8_000),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { error: name === "TimeoutError" ? "Intercepta did not answer in time" : "could not reach Intercepta" };
  }
  if (!response.ok) return { error: `Intercepta answered ${response.status}` };
  const parsed = quickScan.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { error: "unexpected Intercepta response" };
  const scan: CachedScan = {
    toxicScore: parsed.data.toxicScore,
    traits: (parsed.data.traits ?? []).map(toTrait),
    checkedAt: new Date().toISOString(),
  };
  opts.cache.set(address, scan);
  return result(address, scan, false, threshold);
}

function toTrait(t: { name: string; risk?: number | null; txsCount?: number | null; description?: string | null }): Trait {
  return { name: t.name, risk: t.risk ?? null, txsCount: t.txsCount ?? null, description: t.description ?? null };
}

function result(address: Address, scan: CachedScan, cached: boolean, threshold: number): ScanResult {
  const flagged = scan.toxicScore >= threshold || scan.traits.some((t) => SEVERE_TRAITS.has(t.name));
  return { address, ...scan, flagged, cached };
}

function unavailable(reason: string): Screening {
  return { status: "unavailable", message: "screening unavailable", reason };
}

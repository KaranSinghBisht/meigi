import { ensResolver, parseDeclaration, registryReader, type MeigiPayeeDeclaration } from "@meigi/x402-guard";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { createPublicClient, http } from "viem";
import { guardedBuyer } from "./buyer.js";
import type { Config } from "./config.js";
import { railOf } from "./rail.js";

/**
 * A research agent's shopping trip: it needs 2 GPU-minutes and a dataset slice for a job, and tries two
 * merchants it also found along the way - a compromised look-alike, and a cheap source with no Meigi record.
 * Each step is inspected independently of the guard (a plain unauthenticated fetch of the 402, then the
 * registry and ens reads), so the log shows what the buyer *could* have known even where the guard refuses
 * before it would have mattered.
 */
interface Job {
  readonly label: string;
  readonly method: "GET" | "POST";
  readonly path: string;
}

const JOBS: readonly Job[] = [
  { label: "GPU-minute 1 of 2, from Minato GPU Cloud", method: "POST", path: "/compute/minato/gpu-minute" },
  { label: "GPU-minute 2 of 2, from Minato GPU Cloud", method: "POST", path: "/compute/minato/gpu-minute" },
  { label: "A dataset slice from Fuji Data", method: "GET", path: "/data/fuji/dataset/invoice-ocr-2026-09" },
  {
    label: "A cheaper-looking GPU inference mirror it also found",
    method: "POST",
    path: "/compute/minato/inference/compromised",
  },
  { label: "A public web-scrape API with no Meigi record", method: "GET", path: "/web/scrape/undeclared" },
  { label: "Another public web-scrape API, paying an address screening already flags", method: "GET", path: "/web/scrape/undeclared-flagged" },
];

/** On Awaji only Minato GPU Cloud is registered: a GPU-minute from it, then its compromised inference mirror. */
const AWAJI_JOBS: readonly Job[] = [
  { label: "A GPU-minute from Minato GPU Cloud", method: "POST", path: "/compute/minato/gpu-minute" },
  {
    label: "A cheaper-looking GPU inference mirror it also found",
    method: "POST",
    path: "/compute/minato/inference/compromised",
  },
];

export interface ScenarioStep {
  readonly label: string;
  readonly method: string;
  readonly path: string;
  readonly amountAtomic: string | null;
  readonly declared: { tNumber: string; ens: string | null } | null;
  readonly resolvedEns: string | null;
  readonly registryPayout: string | null;
  readonly payTo: string | null;
  readonly screening: { flagged: boolean; summary: string } | null;
  readonly outcome: "settled" | "refused";
  readonly reason: string | null;
  readonly txHash: string | null;
}

export interface ScenarioResult {
  readonly startedAt: string;
  readonly steps: readonly ScenarioStep[];
  readonly settledCount: number;
  readonly refusedCount: number;
  readonly spentAtomic: string;
}

interface Inspection {
  amountAtomic: string | null;
  declared: { tNumber: string; ens: string | null } | null;
  resolvedEns: string | null;
  registryPayout: string | null;
  payTo: string | null;
}

/** What an unauthenticated request to a 402 route reveals, independent of the guard: the declaration itself,
 * plus what the registry and ens (if declared) say about it - the same view a careful buyer would check first.
 * The 402's payload is in the `payment-required` response header (base64 JSON), not the body. */
async function inspect(
  self: string,
  job: Job,
  registry: ReturnType<typeof registryReader>,
  resolveEns: ReturnType<typeof ensResolver> | undefined,
): Promise<Inspection> {
  const response = await fetch(`${self}${job.path}`, { method: job.method });
  const header = response.headers.get("payment-required");
  const required = header ? decodePaymentRequiredHeader(header) : null;
  const accepts = required?.accepts?.[0] as { payTo?: string; amount?: string } | undefined;
  const raw = required?.extensions?.["meigi-payee"];
  const digits = parseDeclaration(raw);
  if (!digits) return { amountAtomic: accepts?.amount ?? null, declared: null, resolvedEns: null, registryPayout: null, payTo: accepts?.payTo ?? null };
  const ens = (raw as Partial<MeigiPayeeDeclaration>).ens ?? null;
  const [payee, resolvedEns] = await Promise.all([
    registry(BigInt(digits)).catch(() => null),
    ens && resolveEns ? resolveEns(ens).catch(() => null) : Promise.resolve(null),
  ]);
  return {
    amountAtomic: accepts?.amount ?? null,
    declared: { tNumber: `T${digits}`, ens },
    resolvedEns: resolvedEns ?? null,
    registryPayout: payee?.status === 1 ? payee.payout : null,
    payTo: accepts?.payTo ?? null,
  };
}

export async function runResearchAgent(config: Config): Promise<ScenarioResult> {
  const startedAt = new Date().toISOString();
  const self = `http://localhost:${config.X402_DEMO_PORT}`;
  const rail = railOf(config);
  const publicClient = createPublicClient({ chain: rail.chain, transport: http(rail.rpcUrl) });
  const registry = registryReader(publicClient, rail.registry);
  const resolveEns = rail.ens ? ensResolver(publicClient) : undefined;
  const buy = guardedBuyer(config);

  const steps: ScenarioStep[] = [];
  let spent = 0n;
  for (const job of rail.name === "awaji" ? AWAJI_JOBS : JOBS) {
    const seen = await inspect(self, job, registry, resolveEns);
    const purchase = await buy(`${self}${job.path}`, { method: job.method });
    const verdict = purchase.verdict;
    const settled = purchase.paid && purchase.settlement !== null;
    const txHash = settlementTxHash(purchase.settlement);
    if (settled) spent += BigInt(seen.amountAtomic ?? "0");
    steps.push({
      label: job.label,
      method: job.method,
      path: job.path,
      amountAtomic: seen.amountAtomic,
      declared: seen.declared,
      resolvedEns: seen.resolvedEns,
      registryPayout: seen.registryPayout,
      payTo: seen.payTo,
      screening: verdict?.screening ?? null,
      outcome: settled ? "settled" : "refused",
      reason: settled ? null : (verdict && !verdict.ok ? verdict.reason : (purchase.error ?? "the purchase did not complete")),
      txHash,
    });
  }
  const settledCount = steps.filter((s) => s.outcome === "settled").length;
  return { startedAt, steps, settledCount, refusedCount: steps.length - settledCount, spentAtomic: spent.toString() };
}

function settlementTxHash(settlement: unknown): string | null {
  if (typeof settlement !== "object" || settlement === null) return null;
  const hash = (settlement as { transaction?: unknown }).transaction;
  return typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash) ? hash : null;
}

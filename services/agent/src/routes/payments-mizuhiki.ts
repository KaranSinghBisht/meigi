import type { IndexedNetwork } from "../history/network.js";
import type { RegisteredPayee } from "../history/types.js";
import { MultiBaasUnavailable } from "../multibaas/client.js";
import { settledRow, yenAmount } from "./payment-rows.js";

/**
 * GET /payments' `mizuhiki` section: Meigi on Mizuhiki Awaji, indexed and queried through its MultiBaas deployment
 * (Curvegrid). Null when that deployment isn't configured; empty lists and a note when it can't answer.
 */
export async function mizuhikiSection(network: IndexedNetwork | null, filter: string[] | null, limit: number) {
  if (!network) return null;
  const base = { chainId: network.chainId, network: network.name, label: network.label, explorer: network.explorer, source: "multibaas" as const };
  let snapshot;
  try {
    snapshot = await network.read(limit);
  } catch (error) {
    if (!(error instanceof MultiBaasUnavailable)) throw error;
    return { ...base, note: `MultiBaas unavailable (${error.message})`, token: null, settled: [], received: [], payees: [] };
  }
  const { token, settled, received } = snapshot;
  const keep = (tNumber: bigint) => !filter || filter.includes(tNumber.toString());
  const payees = latestPerTNumber(snapshot.payees).filter((p) => keep(p.tNumber));
  const nameOf = (tNumber: bigint) => payees.find((p) => p.tNumber === tNumber)?.legalName ?? null;
  return {
    ...base,
    token,
    settled: settled.filter((p) => keep(p.tNumber)).map((p) => ({ ...settledRow(p, token.decimals, { name: nameOf(p.tNumber) }), via: p.via ?? "vault" })),
    received: payees.map((p) => {
      const total = received.find((r) => r.payout.toLowerCase() === p.payout.toLowerCase())?.total ?? 0n;
      return { tNumber: `T${p.tNumber}`, legalName: p.legalName, payout: p.payout, total: yenAmount(total, token.decimals) };
    }),
    payees: payees.map((p) => ({ tNumber: `T${p.tNumber}`, legalName: p.legalName, payout: p.payout, at: p.at, txHash: p.txHash })),
  };
}

/** A T-number registered again (after a revocation) keeps only its newest registration. Rows arrive newest first. */
function latestPerTNumber(payees: RegisteredPayee[]): RegisteredPayee[] {
  const seen = new Set<bigint>();
  return payees.filter((p) => !seen.has(p.tNumber) && Boolean(seen.add(p.tNumber)));
}

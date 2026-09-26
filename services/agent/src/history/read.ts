import type { Address, Hex } from "viem";
import { MultiBaasUnavailable } from "../multibaas/client.js";
import type { IndexedNetwork } from "./network.js";
import type { IndexedHistory, PaymentHistory, ReceivedTotal, SettledPayment } from "./types.js";

export interface HistorySources {
  multibaas: IndexedHistory | null; // the agent's chain in MultiBaas; null: MULTIBAAS_URL / MULTIBAAS_API_KEY not set
  rpc: PaymentHistory;
  mizuhiki: IndexedNetwork | null; // Meigi on Mizuhiki Awaji via its MultiBaas deployment; null: not configured
}

export type Source = "multibaas" | "rpc";
export type Mixed = Source | "multibaas+rpc";

/**
 * Where a list came from. MultiBaas indexes from the block each contract was linked at (a free plan backfills only
 * about 100 blocks), so its rows start at `indexedFrom` and RPC logs supply the older history.
 */
export interface Provenance {
  source: Mixed;
  indexedFrom: bigint | null; // null: MultiBaas wasn't used
  note?: string; // why MultiBaas wasn't used, when it is configured
}

export type TaggedPayment = SettledPayment & { source: Source };
export type TaggedTotal = ReceivedTotal & { source: Mixed };

/** The vault's payments, newest first: MultiBaas's rows from its first indexed block, RPC logs before that. */
export async function readSettled(sources: HistorySources, limit: number): Promise<Provenance & { rows: TaggedPayment[] }> {
  const rpcOnly = async () => tag(await sources.rpc.invoicesPaid(limit), "rpc");
  const { value, ...provenance } = await viaIndex(sources, "vault", rpcOnly, async (mb, from) => {
    const [indexed, older] = await Promise.all([mb.invoicesPaid(limit), sources.rpc.invoicesPaid(limit, { toBlock: from - 1n })]);
    const rows = [...tag(indexed.filter((p) => p.blockNumber >= from), "multibaas"), ...tag(older.filter((p) => p.blockNumber < from), "rpc")];
    return rows.sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1)).slice(0, limit);
  });
  return { ...provenance, rows: value };
}

/** What each payout has received: MultiBaas's totals from its first indexed block plus RPC logs before that. */
export async function readReceived(sources: HistorySources, payouts: Address[]): Promise<Provenance & { totals: TaggedTotal[] }> {
  const rpcOnly = async () => (await sources.rpc.received(payouts)).map((t): TaggedTotal => ({ ...t, source: "rpc" }));
  const { value, ...provenance } = await viaIndex(sources, "token", rpcOnly, async (mb, from) => {
    const [indexed, older] = await Promise.all([mb.received(payouts), sources.rpc.received(payouts, { toBlock: from - 1n })]);
    return payouts.flatMap((payout): TaggedTotal[] => {
      const recent = find(indexed, payout);
      const before = find(older, payout);
      if (recent === 0n && before === 0n) return [];
      const source = recent > 0n && before > 0n ? "multibaas+rpc" : recent > 0n ? "multibaas" : "rpc";
      return [{ payout, total: recent + before, source }];
    });
  });
  return { ...provenance, totals: value };
}

export interface SettlementRead {
  state: "found" | "indexing" | "pending"; // indexing: mined, and MultiBaas hasn't indexed it yet
  found: SettledPayment | null;
  source: Source;
  note?: string;
}

/**
 * A payment's InvoicePaid, confirmed by MultiBaas's index. A payment older than the index is confirmed from its
 * receipt instead; a mined one MultiBaas hasn't reached yet is `indexing`.
 */
export async function readSettlement(sources: HistorySources, txHash: Hex): Promise<SettlementRead> {
  const fromReceipt = async (): Promise<SettlementRead> => {
    const found = await sources.rpc.settlementOf(txHash);
    return { state: found ? "found" : "pending", found, source: "rpc" };
  };
  if (!sources.multibaas) return fromReceipt();
  try {
    const indexed = await sources.multibaas.settlementOf(txHash);
    if (indexed) return { state: "found", found: indexed, source: "multibaas" };
    const receipt = await fromReceipt();
    if (!receipt.found) return receipt;
    const from = await sources.multibaas.indexedFrom("vault");
    return receipt.found.blockNumber < from ? receipt : { state: "indexing", found: null, source: "multibaas" };
  } catch (error) {
    if (!(error instanceof MultiBaasUnavailable)) throw error;
    return { ...(await fromReceipt()), note: unavailable(error) };
  }
}

/** Reads through MultiBaas's index (plus RPC logs for older blocks) when configured and answering, else RPC only. */
async function viaIndex<T>(
  sources: HistorySources,
  contract: "vault" | "token",
  rpcOnly: () => Promise<T>,
  merged: (mb: IndexedHistory, from: bigint) => Promise<T>,
): Promise<Provenance & { value: T }> {
  if (!sources.multibaas) return { value: await rpcOnly(), source: "rpc", indexedFrom: null };
  try {
    const from = await sources.multibaas.indexedFrom(contract);
    const olderToo = from > (sources.rpc.fromBlock ?? 0n); // is there history before the index for RPC to add?
    return { value: await merged(sources.multibaas, from), source: olderToo ? "multibaas+rpc" : "multibaas", indexedFrom: from };
  } catch (error) {
    if (!(error instanceof MultiBaasUnavailable)) throw error;
    return { value: await rpcOnly(), source: "rpc", indexedFrom: null, note: unavailable(error) };
  }
}

function unavailable(error: MultiBaasUnavailable): string {
  return `MultiBaas unavailable (${error.message}); read from RPC logs`;
}

function tag(rows: SettledPayment[], source: Source): TaggedPayment[] {
  return rows.map((p) => ({ ...p, source }));
}

function find(totals: ReceivedTotal[], payout: Address): bigint {
  return totals.find((t) => t.payout.toLowerCase() === payout.toLowerCase())?.total ?? 0n;
}

import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";
import type { IndexedEvent, MultiBaas } from "../multibaas/client.js";
import { MultiBaasUnavailable } from "../multibaas/client.js";
import { CONTRACTS, EVENTS, MAX_QUERY_ROWS, QUERIES } from "../multibaas/labels.js";
import type { IndexedHistory, ReceivedTotal, RegisteredPayee, SettledPayment, TokenInfo } from "./types.js";

/**
 * Settlement history from MultiBaas's event index (Curvegrid), from the block each contract was linked at. Throws
 * MultiBaasUnavailable on any trouble, including a deployment on another chain than `chainId`.
 */
export function createMultiBaasHistory(mb: MultiBaas, chainId: number): IndexedHistory {
  const sameChain = remembered(() => mb.requireChain(chainId));
  const starts = { vault: remembered(() => linkStart(mb, CONTRACTS.vault)), token: remembered(() => linkStart(mb, CONTRACTS.token)) };
  return {
    source: "multibaas",
    async indexedFrom(contract) {
      await sameChain();
      return starts[contract]();
    },
    async invoicesPaid(limit) {
      await sameChain();
      const rows = await mb.query(QUERIES.meigi_invoices_paid, Math.min(limit, MAX_QUERY_ROWS));
      return rows.map((row) => ({ ...paymentRow(row), via: "vault" as const }));
    },
    async received(payouts) {
      await sameChain();
      const wanted = new Set(payouts.map((p) => p.toLowerCase()));
      const rows = await mb.query(QUERIES.meigi_mjpy_received, MAX_QUERY_ROWS);
      const totals: ReceivedTotal[] = [];
      for (const row of rows) {
        const payout = String(row.payout ?? "");
        if (wanted.has(payout.toLowerCase())) totals.push({ payout: address(payout), total: bigintOf(row.total) });
      }
      return totals;
    },
    async settlementOf(txHash) {
      await sameChain();
      const events = await mb.events({ contractLabel: CONTRACTS.vault.label, eventSignature: EVENTS.invoicePaid, txHash, limit: 10 });
      const paid = events.find((e) => e.event.name === "InvoicePaid");
      return paid ? fromEvent(paid) : null;
    },
  };
}

/**
 * A read whose answer doesn't change once it succeeds (the chain, where indexing starts). A failure is remembered for
 * `retryMs`, so a misconfigured or unlinked deployment costs a call every few minutes, not one per request.
 */
function remembered<T>(read: () => Promise<T>, retryMs = 5 * 60_000): () => Promise<T> {
  let answer: Promise<T> | null = null;
  let failed: { error: unknown; at: number } | null = null;
  return () => {
    if (failed && Date.now() - failed.at < retryMs) return Promise.reject(failed.error);
    answer ??= read().catch((error: unknown) => {
      answer = null;
      failed = { error, at: Date.now() };
      throw error;
    });
    return answer;
  };
}

/** The block MultiBaas started indexing a linked contract's events from. */
async function linkStart(mb: MultiBaas, contract: { alias: string; label: string }): Promise<bigint> {
  const path = `/chains/ethereum/addresses/${contract.alias}/contracts/${contract.label}/status`;
  const status = z.object({ startBlockNumber: z.number().int().nonnegative() }).safeParse(
    await mb.call("GET", path).catch((error: unknown) => {
      if (error instanceof MultiBaasUnavailable && error.status === 404) throw new MultiBaasUnavailable(`${contract.alias} isn't linked in MultiBaas`, 404);
      throw error;
    }),
  );
  if (!status.success) throw new MultiBaasUnavailable("MultiBaas returned its indexing status in an unexpected shape");
  return BigInt(status.data.startBlockNumber);
}

/** Payments made through the PayRouter (pay by T-number), newest first. */
export async function routerPaid(mb: MultiBaas, limit: number): Promise<SettledPayment[]> {
  const rows = await mb.query(QUERIES.meigi_router_paid, Math.min(limit, MAX_QUERY_ROWS));
  return rows.map((row) => ({ ...paymentRow(row), via: "router" as const }));
}

/** Every company the registry has recorded, newest first. */
export async function payeesRegistered(mb: MultiBaas): Promise<RegisteredPayee[]> {
  const rows = await mb.query(QUERIES.meigi_payees_registered, MAX_QUERY_ROWS);
  return rows.map((row) => {
    if (typeof row.legalname !== "string" || !isHex(row.txhash)) throw new MultiBaasUnavailable("MultiBaas returned a PayeeRegistered without a name");
    return { tNumber: bigintOf(row.tnumber), payout: address(row.payout), legalName: row.legalname, at: typeof row.at === "string" ? row.at : null, txHash: row.txhash };
  });
}

const methodOutput = z.object({ output: z.union([z.string(), z.number()]) });

/** The token's symbol and decimals, read through MultiBaas's contract call API (a read, nothing is signed). */
export async function tokenInfo(mb: MultiBaas): Promise<TokenInfo> {
  const read = async (method: string) => {
    const path = `/chains/ethereum/addresses/${CONTRACTS.token.alias}/contracts/${CONTRACTS.token.label}/methods/${method}`;
    const parsed = methodOutput.safeParse(await mb.call("POST", path, { args: [] }));
    if (!parsed.success) throw new MultiBaasUnavailable(`MultiBaas returned the token's ${method} in an unexpected shape`);
    return parsed.data.output;
  };
  const [symbol, decimals] = await Promise.all([read("symbol"), read("decimals")]);
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 36) throw new MultiBaasUnavailable("MultiBaas returned unusable token decimals");
  return { symbol: String(symbol), decimals: places };
}

function paymentRow(row: Record<string, unknown>): SettledPayment {
  return payment({ txHash: row.txhash, blockNumber: row.block, at: row.at, tNumber: row.tnumber, payout: row.payout, amount: row.amount, invoiceRef: row.invoiceref });
}

function fromEvent(e: IndexedEvent): SettledPayment {
  const input = (name: string) => e.event.inputs.find((field) => field.name === name)?.value;
  return payment({
    txHash: e.transaction.txHash,
    blockNumber: e.transaction.blockNumber,
    at: e.triggeredAt,
    tNumber: input("tNumber"),
    payout: input("payout"),
    amount: input("amount"),
    invoiceRef: input("invoiceRef"),
  });
}

function payment(raw: Record<Exclude<keyof SettledPayment, "via">, unknown>): SettledPayment {
  if (!isHex(raw.txHash) || !isHex(raw.invoiceRef)) throw new MultiBaasUnavailable("MultiBaas returned a payment without a hash");
  return {
    txHash: raw.txHash as Hex,
    blockNumber: bigintOf(raw.blockNumber),
    at: typeof raw.at === "string" ? raw.at : null,
    tNumber: bigintOf(raw.tNumber),
    payout: address(raw.payout),
    amount: bigintOf(raw.amount),
    invoiceRef: raw.invoiceRef as Hex,
  };
}

function bigintOf(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if ((typeof value === "number" && Number.isSafeInteger(value)) || (typeof value === "string" && /^\d+$/u.test(value))) return BigInt(value);
  throw new MultiBaasUnavailable("MultiBaas returned a number in an unexpected format");
}

function address(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new MultiBaasUnavailable("MultiBaas returned an invalid address");
  return getAddress(value);
}

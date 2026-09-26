import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import { z } from "zod";
import type { MultiBaas } from "../multibaas/client.js";
import { MultiBaasUnavailable } from "../multibaas/client.js";
import { CONTRACTS, MAX_QUERY_ROWS, QUERIES } from "../multibaas/labels.js";
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
    // MultiBaas's GET /events ignores its tx_hash filter (it answers [] for a hash it has indexed), so the payment is
    // looked up in the saved query instead: newest first, which is where a payment being confirmed is.
    async settlementOf(txHash) {
      await sameChain();
      const rows = await mb.query(QUERIES.meigi_invoices_paid, MAX_QUERY_ROWS);
      const row = rows.find((r) => typeof r.txhash === "string" && r.txhash.toLowerCase() === txHash.toLowerCase());
      return row ? { ...paymentRow(row), via: "vault" as const } : null;
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
  const rows = await mb.saved("meigi_router_paid", Math.min(limit, MAX_QUERY_ROWS)); // saved: it filters on the deployment's token
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
    const answer = await mb.call("POST", path, { args: [] }).catch((error: unknown) => {
      const unknownAlias = error instanceof MultiBaasUnavailable && (error.status === 404 || error.detail === "invalid address");
      throw unknownAlias ? new MultiBaasUnavailable(`${CONTRACTS.token.alias} isn't linked in MultiBaas`, error.status) : error;
    });
    const parsed = methodOutput.safeParse(answer);
    if (!parsed.success) throw new MultiBaasUnavailable(`MultiBaas returned the token's ${method} in an unexpected shape`);
    return parsed.data.output;
  };
  const [symbol, decimals] = await Promise.all([read("symbol"), read("decimals")]);
  const places = Number(decimals);
  if (!Number.isInteger(places) || places < 0 || places > 36) throw new MultiBaasUnavailable("MultiBaas returned unusable token decimals");
  return { symbol: String(symbol), decimals: places };
}

function paymentRow(row: Record<string, unknown>): SettledPayment {
  return payment({ txHash: row.txhash, blockNumber: row.block, at: isoTime(row.at), tNumber: row.tnumber, payout: row.payout, amount: row.amount, invoiceRef: bytes32(row.invoiceref) });
}

/**
 * Event queries return a bytes32 as its bytes, "[218, 200, 17, …]" (GET /events returns hex). Either becomes hex;
 * anything else is left for payment() to reject.
 */
function bytes32(value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith("[")) return value;
  const bytes = value.slice(1, -1).split(",").map((b) => Number(b.trim()));
  if (bytes.length !== 32 || !bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return value;
  return `0x${bytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** triggered_at as event queries return it ("2026-09-26 05:58:24+00") → ISO 8601, or null. */
function isoTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/u.exec(value.trim());
  if (!m) return null;
  const zone = !m[3] || m[3] === "Z" ? "Z" : m[3].length === 3 ? `${m[3]}:00` : m[3].replace(/^([+-]\d{2})(\d{2})$/u, "$1:$2");
  const ms = Date.parse(`${m[1]}T${m[2]}${zone}`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
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

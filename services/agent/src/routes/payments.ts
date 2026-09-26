import { Hono } from "hono";
import type { Address } from "viem";
import { z } from "zod";
import type { StoredAnalysis } from "../analysis/store.js";
import { formatTokenYen, registeredName } from "../chain/format.js";
import type { AppDeps } from "../deps.js";
import { parseTNumber } from "../extract/tnumber.js";
import { readHistory } from "../history/read.js";
import type { SettledPayment } from "../history/types.js";
import { HttpError } from "../http.js";
import { load } from "./lookup.js";

const paymentsQuery = z.object({
  tNumber: z.string().max(300).optional(), // comma-separated T-numbers; default: the vendor list
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Settlement, read from MultiBaas's event index when it is configured (Curvegrid) and from RPC logs otherwise;
 * every section says which. Refusals never reach the chain, so they come from this agent's own analyses.
 */
export function paymentRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/payments", async (c) => {
    const query = paymentsQuery.parse({ tNumber: c.req.query("tNumber"), limit: c.req.query("limit") });
    const filter = query.tNumber === undefined ? null : tNumbersOf(query.tNumber);
    const { decimals } = await deps.chain.token();
    const names = nameCache(deps);
    const settled = await readHistory(deps.history, (h) => h.invoicesPaid(query.limit));
    const rows = settled.value.filter((p) => !filter || filter.includes(p.tNumber.toString()));
    const received = await receivedRows(deps, filter ?? deps.vendorTNumbers, decimals, names);
    return c.json({
      source: { settled: settled.source, received: received.source },
      notes: [...new Set([settled.note, received.note].filter((note): note is string => Boolean(note)))],
      settled: await Promise.all(rows.map(async (p) => settledRow(p, decimals, await names(p.tNumber)))),
      received: received.rows,
      refused: refusedRows(deps.store.recent(500), filter, query.limit),
    });
  });

  /** Is this invoice's payment in the chain's history yet? MultiBaas's index first, RPC as the fallback. */
  app.get("/invoices/:id/settlement", async (c) => {
    const stored = load(deps, c.req.param("id"));
    const payment = stored.payment;
    if (!payment || (payment.status !== "paid" && payment.status !== "pending")) {
      throw new HttpError(404, "not_paid", "this invoice has no payment to settle");
    }
    const { value: found, source, note } = await readHistory(deps.history, (h) => h.settlementOf(payment.txHash));
    const status = !found ? (source === "multibaas" ? "indexing" : "pending") : matches(found, stored) ? "confirmed" : "mismatch";
    const detail = found ? { blockNumber: found.blockNumber.toString(), at: found.at } : {};
    return c.json({ status, source, txHash: payment.txHash, ...detail, ...(note ? { note } : {}) });
  });

  return app;
}

function tNumbersOf(list: string): string[] {
  return list.split(",").map((entry) => {
    const digits = parseTNumber(entry.trim());
    if (!digits) throw new HttpError(400, "invalid_t_number", "tNumber must be T followed by 13 digits, comma-separated");
    return digits;
  });
}

/** The registered name per T-number, read once per request (an unregistered or disputed payee has none). */
function nameCache(deps: AppDeps) {
  const cache = new Map<string, Promise<{ name: string | null; payout: Address | null }>>();
  return (tNumber: bigint | string) => {
    const key = tNumber.toString();
    let hit = cache.get(key);
    if (!hit) {
      hit = deps.chain.payee(BigInt(key)).then((p) => ({ name: registeredName(p), payout: p.status === "active" ? p.payout : null }));
      cache.set(key, hit);
    }
    return hit;
  };
}

function settledRow(p: SettledPayment, decimals: number, payee: { name: string | null }) {
  return {
    txHash: p.txHash,
    blockNumber: p.blockNumber.toString(),
    at: p.at,
    tNumber: `T${p.tNumber}`,
    legalName: payee.name,
    payout: p.payout,
    amount: { units: p.amount.toString(), display: formatTokenYen(p.amount, decimals) },
    invoiceRef: p.invoiceRef,
  };
}

async function receivedRows(deps: AppDeps, tNumbers: string[], decimals: number, names: ReturnType<typeof nameCache>) {
  const payees = await Promise.all(tNumbers.map(async (t) => ({ tNumber: t, ...(await names(t)) })));
  const payouts = payees.flatMap((p) => (p.payout ? [p.payout] : []));
  const totals = await readHistory(deps.history, (h) => h.received(payouts));
  const rows = payees
    .filter((p) => p.payout)
    .map((p) => {
      const total = totals.value.find((t) => t.payout.toLowerCase() === p.payout!.toLowerCase())?.total ?? 0n;
      return { tNumber: `T${p.tNumber}`, legalName: p.name, payout: p.payout!, total: { units: total.toString(), display: formatTokenYen(total, decimals) } };
    });
  return { rows, source: totals.source, note: totals.note };
}

/** What this agent refused to pay automatically (its holds), newest first. In memory: since the agent started. */
function refusedRows(recent: StoredAnalysis[], filter: string[] | null, limit: number) {
  return recent
    .filter((s) => s.verdict.decision === "hold")
    .map((s) => ({
      analysisId: s.view.id,
      at: s.view.createdAt,
      tNumber: s.view.kernel.payee?.tNumber ?? s.view.extracted.tNumber,
      legalName: s.view.kernel.payee?.legalName ?? null,
      amount: s.intent?.amountDisplay ?? null,
      reasons: [...new Set(s.verdict.reasons.map((r) => r.code))],
    }))
    .filter((row) => !filter || (row.tNumber !== null && filter.includes(row.tNumber.replace(/^T/u, ""))))
    .slice(0, limit);
}

function matches(found: SettledPayment, stored: StoredAnalysis): boolean {
  const intent = stored.intent;
  return Boolean(intent) && found.tNumber.toString() === intent!.tNumber && found.amount === intent!.amount && found.invoiceRef === intent!.invoiceRef;
}

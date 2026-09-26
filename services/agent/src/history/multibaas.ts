import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import type { IndexedEvent, MultiBaas } from "../multibaas/client.js";
import { MultiBaasUnavailable } from "../multibaas/client.js";
import { CONTRACTS, EVENTS, QUERIES } from "../multibaas/labels.js";
import type { PaymentHistory, ReceivedTotal, SettledPayment } from "./types.js";

/** Settlement history from MultiBaas's event index (Curvegrid). Throws MultiBaasUnavailable on any trouble. */
export function createMultiBaasHistory(mb: MultiBaas): PaymentHistory {
  return {
    source: "multibaas",
    async invoicesPaid(limit) {
      const rows = await mb.query(QUERIES.meigi_invoices_paid, limit);
      return rows.map((row) =>
        payment({ txHash: row.txhash, blockNumber: row.block, at: row.at, tNumber: row.tnumber, payout: row.payout, amount: row.amount, invoiceRef: row.invoiceref }),
      );
    },
    async received(payouts) {
      const wanted = new Set(payouts.map((p) => p.toLowerCase()));
      const rows = await mb.query(QUERIES.meigi_mjpyc_received, 1000);
      const totals: ReceivedTotal[] = [];
      for (const row of rows) {
        const payout = String(row.payout ?? "");
        if (wanted.has(payout.toLowerCase())) totals.push({ payout: address(payout), total: bigintOf(row.total) });
      }
      return totals;
    },
    async settlementOf(txHash) {
      const events = await mb.events({ contractLabel: CONTRACTS.vault.label, eventSignature: EVENTS.invoicePaid, txHash, limit: 10 });
      const paid = events.find((e) => e.event.name === "InvoicePaid");
      return paid ? fromEvent(paid) : null;
    },
  };
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

function payment(raw: Record<keyof SettledPayment, unknown>): SettledPayment {
  if (!isHex(raw.txHash) || !isHex(raw.invoiceRef)) throw new MultiBaasUnavailable("MultiBaas returned an InvoicePaid without a hash");
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

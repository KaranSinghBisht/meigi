import { formatTokenYen } from "../chain/format.js";
import type { SettledPayment } from "../history/types.js";

/** One settled payment as GET /payments reports it. */
export function settledRow(p: SettledPayment, decimals: number, payee: { name: string | null }) {
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

/** A token amount in units and as yen. */
export function yenAmount(units: bigint, decimals: number) {
  return { units: units.toString(), display: formatTokenYen(units, decimals) };
}

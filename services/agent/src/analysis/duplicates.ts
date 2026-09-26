import type { PaymentIntent } from "../kernel/intent.js";
import type { AnalysisStore } from "./store.js";

/** "MS-2026-0917", "MS/2026/0917", "ms 2026 0917" → "MS20260917": the invoice number without its separators. */
export function invoiceKey(invoiceNumber: string): string {
  return invoiceNumber.normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

/**
 * The number of an invoice this agent already paid that looks like the same bill written differently: the same
 * payee and amount, the same number once separators are dropped, but a different invoiceRef. The vault de-duplicates
 * by invoiceRef alone, and that hashing must never change (already-paid refs could pay again), so this local check
 * holds for a person instead. Null when there is none.
 */
export function paidLookalike(store: AnalysisStore, intent: PaymentIntent | null): string | null {
  if (!intent) return null;
  const key = invoiceKey(intent.invoiceNumber);
  const match = store.find((stored) => {
    const paid = stored.intent;
    if (stored.payment?.status !== "paid" || !paid) return false;
    const samePayment = paid.tNumber === intent.tNumber && paid.amount === intent.amount;
    return samePayment && paid.invoiceRef !== intent.invoiceRef && invoiceKey(paid.invoiceNumber) === key;
  });
  return match?.intent?.invoiceNumber ?? null;
}

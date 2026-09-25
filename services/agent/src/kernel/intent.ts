import { formatUnits, getAddress, isAddress, keccak256, parseUnits, toBytes, zeroAddress, type Address, type Hex } from "viem";
import { parseAmount } from "../extract/amounts.js";
import { formatYen, toScaled } from "../extract/money.js";
import { parseTNumber } from "../extract/tnumber.js";
import type { Extracted } from "../extract/types.js";
import type { Proposal } from "../llm/types.js";
import type { Reason } from "./reasons.js";

/** The exact `payInvoice` call the agent would make. */
export interface PaymentIntent {
  source: "llm" | "extraction"; // who chose the destination; the T-number and amount always come from the document
  tNumber: string; // 13 digits
  payTo: Address | null; // null: pay by T-number alone (expectedPayout = 0 → the registered payout)
  amountValue: string; // decimal yen
  amountDisplay: string;
  amount: bigint; // token units
  invoiceNumber: string;
  invoiceRef: Hex;
}

export interface IntentOutcome {
  intent: PaymentIntent | null;
  reasons: Reason[];
}

/** The invoice number when it is a plain identifier; anything else (an x402 URL, say) is "this invoice" in prose. */
export function invoiceLabel(invoiceNumber: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9\-_/.]{0,40}$/u.test(invoiceNumber) ? `invoice ${invoiceNumber}` : "this invoice";
}

/**
 * invoiceRef = keccak256("T2011001234567|MS-2026-0917"): the vault pays each (vendor, invoice) once. The number
 * is width-folded and upper-cased first, so "ms-2026-0917" can't be paid again as a "different" invoice.
 */
export function invoiceRefOf(tDigits: string, invoiceNumber: string): Hex {
  return keccak256(toBytes(`T${tDigits}|${invoiceNumber.normalize("NFKC").trim().toUpperCase()}`));
}

/**
 * The payment the agent would make. The T-number and the amount come only from the deterministic extraction;
 * the model's values are cross-checked, and any disagreement blocks. The destination may come from the agent's
 * proposal, because the chain rejects any address but the registered payout. The duplicate key never depends
 * on model output: with no printed invoice number it is derived from the printed facts (and the hold is blocking).
 */
export function buildIntent(extracted: Extracted, proposal: Proposal | null, decimals: number): IntentOutcome {
  const reasons: Reason[] = [];
  const tDigits = extracted.tNumber?.slice(1) ?? null;
  crossCheckTNumber(extracted, proposal, reasons);
  const { payTo, source } = pickAddress(extracted, proposal, reasons, tDigits);
  const printed = extracted.amount?.value ?? null;
  crossCheckAmount(printed, proposal, reasons, tDigits);
  if (!tDigits || printed === null) {
    const missing = [!tDigits && "T-number", printed === null && "amount"].filter(Boolean).join(" or ");
    const message = `Can't build a payment: the document prints no ${missing}.`;
    reasons.push({ code: "incomplete_payment", severity: "block", layer: "intent", tNumber: null, legalName: null, message });
    return { intent: null, reasons };
  }
  const invoiceNumber = extracted.invoiceNumber ?? `FACTS-${printed}-${extracted.dueDate ?? "NODUE"}`;
  const { amount, amountValue } = tokenAmount(extracted, printed, decimals);
  const intent: PaymentIntent = {
    source,
    tNumber: tDigits,
    payTo,
    amountValue,
    amountDisplay: formatYen(amountValue),
    amount,
    invoiceNumber,
    invoiceRef: invoiceRefOf(tDigits, invoiceNumber),
  };
  return { intent, reasons };
}

/** x402 amounts are already token units; everything else is yen converted at the token's decimals. */
function tokenAmount(extracted: Extracted, printed: string, decimals: number): { amount: bigint; amountValue: string } {
  if (extracted.x402?.amountAtomic) {
    const atomic = BigInt(extracted.x402.amountAtomic);
    return { amount: atomic, amountValue: formatUnits(atomic, decimals) };
  }
  return { amount: toScaled(printed) > 0n ? parseUnits(printed, decimals) : 0n, amountValue: printed };
}

function crossCheckTNumber(extracted: Extracted, proposal: Proposal | null, reasons: Reason[]): void {
  const proposed = proposal?.tNumber ? parseTNumber(proposal.tNumber) : null;
  if (proposed && `T${proposed}` !== extracted.tNumber) {
    const printed = extracted.tNumber ? `the document names ${extracted.tNumber}` : "the document names none";
    reasons.push(reason("proposal_t_number_differs", `T${proposed}`, `The agent wants to pay T${proposed}, but ${printed}.`));
  }
}

function pickAddress(extracted: Extracted, proposal: Proposal | null, reasons: Reason[], t: string | null) {
  const printed = { payTo: extracted.address, source: "extraction" as const };
  const proposed = proposal?.payTo?.trim();
  if (!proposed) return printed;
  if (!isAddress(proposed, { strict: false }) || proposed.toLowerCase() === zeroAddress) {
    const invalid = reason("proposal_address_invalid", tLabel(t), "The agent proposed a payment address that is not a usable address.");
    reasons.push({ ...invalid, evidence: proposed.slice(0, 80) });
    return printed;
  }
  const address = getAddress(proposed.toLowerCase());
  if (!extracted.addresses.includes(address)) {
    reasons.push(reason("proposal_address_not_in_document", tLabel(t), `The agent wants to pay ${address}, which the document never prints.`));
  }
  return { payTo: address, source: "llm" as const };
}

function crossCheckAmount(printed: string | null, proposal: Proposal | null, reasons: Reason[], t: string | null): void {
  const proposed = proposal?.amount ? parseAmount(proposal.amount) : null;
  if (proposed === null || (printed !== null && toScaled(proposed) === toScaled(printed))) return;
  const asks = printed === null ? "the document prints no amount" : `the document asks for ${formatYen(printed)}`;
  reasons.push(reason("proposal_amount_differs", tLabel(t), `The agent proposes ${formatYen(proposed)}, but ${asks}.`));
}

function tLabel(t: string | null): string | null {
  return t ? `T${t}` : null;
}

function reason(code: string, tNumber: string | null, message: string): Reason {
  return { code, severity: "block", layer: "intent", tNumber, legalName: null, message };
}

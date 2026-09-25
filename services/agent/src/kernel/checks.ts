import type { Address } from "viem";
import { distinctShort, formatTokenYen, isoTime, payeeLabel, shortAddress } from "../chain/format.js";
import type { Snapshot } from "../chain/types.js";
import type { X402Details } from "../extract/types.js";
import { documentChecks } from "./document-checks.js";
import type { PaymentIntent } from "./intent.js";
import type { CheckResult } from "./reasons.js";

/**
 * The same checks `AgentVault.payInvoice` enforces, in the same order (then a few about the document itself),
 * evaluated against one chain snapshot. The chain is the final word; running them first lets the agent hold
 * (and explain) instead of reverting.
 */

export interface KernelInput {
  intent: PaymentIntent;
  snapshot: Snapshot;
  decimals: number;
  agent: Address; // the key this service signs with
  documentAddresses: Address[]; // every address printed in the document
  document: { claimedName: string | null; x402: X402Details | null };
  chain: { chainId: number; token: Address };
}

type Check = (input: KernelInput, label: string) => CheckResult | CheckResult[] | null;

export const pass = (code: string, message: string): CheckResult => ({ code, ok: true, severity: "block", message });
export const fail = (code: string, message: string, revert?: string): CheckResult => ({ code, ok: false, severity: "block", message, revert });

const CHECKS: Check[] = [
  ({ snapshot, agent }) =>
    snapshot.vault.agent.toLowerCase() === agent.toLowerCase()
      ? null
      : fail("not_agent", `This service signs as ${agent}, but the vault's agent is ${snapshot.vault.agent}.`, "NotAgent"),
  ({ snapshot }) =>
    snapshot.vault.paused ? fail("vault_paused", "The vault owner has paused all payments.", "EnforcedPause") : null,
  ({ intent }) =>
    intent.amount > 0n ? null : fail("not_payable", `Nothing to pay: the amount is ${intent.amountDisplay}.`, "ZeroAmount"),
  vendorApproved,
  vendorActive,
  payeeActive,
  payoutMatches,
  vendorPinned,
  perPaymentCap,
  periodCap,
  notPaidBefore,
  vaultBalance,
  pendingChange,
  documentChecks,
];

export function runChecks(input: KernelInput): CheckResult[] {
  const label = payeeLabel(input.intent.tNumber, input.snapshot.payee.legalName || null);
  return CHECKS.flatMap((check) => check(input, label) ?? []);
}

function vendorApproved({ snapshot }: KernelInput, label: string): CheckResult {
  return snapshot.vendor.approved
    ? pass("vendor_approved", `${label} is an approved vendor of this vault.`)
    : fail("vendor_not_approved", `${label} is not on this vault's approved vendor list.`, "VendorNotApproved");
}

function vendorActive({ snapshot }: KernelInput, label: string): CheckResult | null {
  const { vendor, timestamp } = snapshot;
  if (!vendor.approved || timestamp >= vendor.activeAt) return null;
  return fail("vendor_not_yet_active", `${label} was approved recently; payments open at ${isoTime(vendor.activeAt)}.`, "VendorNotYetActive");
}

function payeeActive({ snapshot }: KernelInput, label: string): CheckResult {
  const { payee } = snapshot;
  if (payee.status === "active") return pass("payee_registered", `${label} is registered and active.`);
  if (payee.status === "disputed") {
    return fail("payee_disputed", `${label} is frozen by a dispute: nobody can be paid until it is resolved.`, "PayeeNotActive");
  }
  return fail("payee_not_registered", `${label} is not registered in the Meigi registry.`, "PayeeNotActive");
}

/** Every address printed in the document, and the one the agent chose, must be the registered payout. */
function payoutMatches({ snapshot, intent, documentAddresses }: KernelInput, label: string): CheckResult[] {
  const { payee } = snapshot;
  if (payee.status !== "active") return [];
  const asked = [...new Set([...documentAddresses, ...(intent.payTo ? [intent.payTo] : [])])];
  if (asked.length === 0) {
    return [pass("pay_by_t_number", `No address in the document: the vault pays ${label}'s registered payout ${payee.payout}.`)];
  }
  return asked.map((address) => {
    if (address.toLowerCase() === payee.payout.toLowerCase()) {
      return pass("payout_matches", `${address} is ${label}'s registered payout.`);
    }
    const [registered, other] = distinctShort(payee.payout, address);
    return fail("payout_mismatch", `${label} pays ${registered}; this invoice asked for ${other}.`, "PayeeMismatch");
  });
}

function vendorPinned({ snapshot }: KernelInput, label: string): CheckResult | null {
  const { vendor, payee } = snapshot;
  if (!vendor.approved || payee.status !== "active" || !vendor.payout) return null;
  if (vendor.payout.toLowerCase() === payee.payout.toLowerCase()) return null;
  const message = `${label}'s registered payout changed since approval (${shortAddress(vendor.payout)} → ${shortAddress(payee.payout)}); the vault owner must re-approve it.`;
  return fail("vendor_payout_changed", message, "VendorPayoutChanged");
}

function perPaymentCap({ snapshot, intent, decimals }: KernelInput, label: string): CheckResult | null {
  const { vendor } = snapshot;
  if (!vendor.approved || intent.amount <= 0n) return null;
  const cap = formatTokenYen(vendor.capPerPayment, decimals);
  return intent.amount <= vendor.capPerPayment
    ? pass("within_payment_cap", `${intent.amountDisplay} is within ${label}'s ${cap} per-payment cap.`)
    : fail("over_payment_cap", `${intent.amountDisplay} is over ${label}'s ${cap} per-payment cap.`, "OverPaymentCap");
}

function periodCap({ snapshot, intent, decimals }: KernelInput, label: string): CheckResult | null {
  const { vendor, payee, timestamp } = snapshot;
  if (!vendor.approved || intent.amount <= 0n || intent.amount > vendor.capPerPayment) return null;
  // remainingInPeriod reads 0 before activeAt, for an inactive payee and for a changed payout; each has its own reason.
  if (timestamp < vendor.activeAt || payee.status !== "active") return null;
  if (vendor.payout?.toLowerCase() !== payee.payout.toLowerCase()) return null;
  const remaining = formatTokenYen(vendor.remainingInPeriod, decimals);
  return intent.amount <= vendor.remainingInPeriod
    ? pass("within_period_cap", `${intent.amountDisplay} fits the ${remaining} ${label} can still receive this period.`)
    : fail("over_period_cap", `${intent.amountDisplay} is more than the ${remaining} ${label} can still receive this period.`, "OverPeriodCap");
}

/** Messages never quote the invoice number (document text); it travels as evidence for the console. */
function notPaidBefore({ snapshot, intent, decimals }: KernelInput): CheckResult {
  const evidence = intent.invoiceNumber;
  if (snapshot.invoicePaid === 0n) return { ...pass("not_paid_before", "This invoice hasn't been paid before."), evidence };
  const paid = formatTokenYen(snapshot.invoicePaid, decimals);
  return { ...fail("invoice_already_paid", `This invoice was already paid (${paid}).`, "InvoiceAlreadyPaid"), evidence };
}

function vaultBalance({ snapshot, intent, decimals }: KernelInput): CheckResult | null {
  if (intent.amount <= 0n) return null;
  const balance = formatTokenYen(snapshot.vault.balance, decimals);
  return snapshot.vault.balance >= intent.amount
    ? pass("vault_funded", `The vault holds ${balance}.`)
    : fail("insufficient_balance", `The vault holds ${balance}, but this payment needs ${intent.amountDisplay}.`, "ERC20InsufficientBalance");
}

/** A queued change is announced, but its address never is before it lands (the registry explorer's rule too). */
function pendingChange({ snapshot }: KernelInput, label: string): CheckResult | null {
  const { payee } = snapshot;
  if (payee.status !== "active" || !payee.pending || !payee.effectiveAt) return null;
  const message = `${label} has a payout change queued for ${isoTime(payee.effectiveAt)}; after that the vault pauses this vendor until the owner re-approves.`;
  return { code: "payout_change_pending", ok: false, severity: "warn", message };
}

import type { Address } from "viem";
import { formatTokenYen } from "../chain/format.js";
import type { ChainPort, Snapshot } from "../chain/types.js";
import type { Extracted } from "../extract/types.js";
import type { Proposal } from "../llm/types.js";
import { runChecks, type KernelInput } from "./checks.js";
import { buildIntent, type PaymentIntent } from "./intent.js";
import type { CheckResult, Reason } from "./reasons.js";

/** The deterministic kernel's verdict on one payment intent. Only this layer (and the chain) decides money. */
export interface KernelResult {
  status: "checked" | "incomplete" | "chain_unavailable";
  ok: boolean;
  intent: IntentView | null;
  payee: PayeeView | null;
  vendor: VendorView | null;
  checks: CheckResult[];
  reasons: Reason[];
  blockNumber: string | null;
}

export interface IntentView {
  source: PaymentIntent["source"];
  tNumber: string;
  payTo: Address | null;
  expectedPayout: Address; // what payInvoice receives: payTo, or zero for "the registered payout"
  amount: { value: string; display: string; units: string };
  invoiceNumber: string;
  invoiceRef: string;
}

export interface PayeeView {
  tNumber: string;
  status: string;
  legalName: string | null;
  registeredPayout: Address | null;
  changePending: boolean; // a payout change is queued; its address is never shown before it lands
  pendingEffectiveAt: number | null;
}

export interface VendorView {
  approved: boolean;
  approvedPayout: Address | null;
  activeAt: number | null;
  capPerPayment: string;
  capPerPeriod: string;
  remainingInPeriod: string;
}

export interface KernelRun {
  result: KernelResult;
  intent: PaymentIntent | null;
}

const ZERO: Address = "0x0000000000000000000000000000000000000000";

export async function runKernel(chain: ChainPort, extracted: Extracted, proposal: Proposal | null): Promise<KernelRun> {
  let token: { address: Address; decimals: number };
  try {
    token = await chain.token();
  } catch (error) {
    return { result: unavailable([], error), intent: null };
  }
  const built = buildIntent(extracted, proposal, token.decimals);
  if (!built.intent) return { result: incomplete(built.reasons), intent: null };
  let snapshot: Snapshot;
  try {
    snapshot = await chain.snapshot(BigInt(built.intent.tNumber), built.intent.invoiceRef);
  } catch (error) {
    return { result: unavailable(built.reasons, error), intent: null };
  }
  const context: EvaluationContext = {
    decimals: token.decimals,
    agent: chain.agent,
    documentAddresses: extracted.addresses,
    document: { claimedName: extracted.claimedName, x402: extracted.x402 },
    chain: { chainId: chain.chainId, token: token.address },
  };
  return { result: evaluate(built.intent, built.reasons, snapshot, context), intent: built.intent };
}

export type EvaluationContext = Omit<KernelInput, "intent" | "snapshot">;

/** Pure: intent + snapshot → verdict. Every reason carries the registry's legal name for the T-number. */
export function evaluate(intent: PaymentIntent, intentReasons: Reason[], snapshot: Snapshot, context: EvaluationContext): KernelResult {
  const { decimals } = context;
  const checks = runChecks({ intent, snapshot, ...context });
  const legalName = snapshot.payee.legalName || null;
  const tNumber = `T${intent.tNumber}`;
  const failed: Reason[] = checks
    .filter((check) => !check.ok)
    .map(({ ok: _ok, ...check }) => ({ ...check, layer: "kernel", tNumber, legalName }));
  const reasons = [...intentReasons.map((r) => ({ ...r, legalName: r.tNumber === tNumber ? legalName : r.legalName })), ...failed];
  return {
    status: "checked",
    ok: !reasons.some((r) => r.severity === "block"),
    intent: intentView(intent),
    payee: payeeView(tNumber, snapshot),
    vendor: vendorView(snapshot, decimals),
    checks,
    reasons,
    blockNumber: snapshot.blockNumber.toString(),
  };
}

function intentView(intent: PaymentIntent): IntentView {
  return {
    source: intent.source,
    tNumber: `T${intent.tNumber}`,
    payTo: intent.payTo,
    expectedPayout: intent.payTo ?? ZERO,
    amount: { value: intent.amountValue, display: intent.amountDisplay, units: intent.amount.toString() },
    invoiceNumber: intent.invoiceNumber,
    invoiceRef: intent.invoiceRef,
  };
}

function payeeView(tNumber: string, s: Snapshot): PayeeView {
  const registered = s.payee.status !== "none";
  return {
    tNumber,
    status: s.payee.status,
    legalName: s.payee.legalName || null,
    registeredPayout: registered ? s.payee.payout : null,
    changePending: s.payee.pending !== null,
    pendingEffectiveAt: s.payee.effectiveAt,
  };
}

function vendorView(s: Snapshot, decimals: number): VendorView {
  const v = s.vendor;
  return {
    approved: v.approved,
    approvedPayout: v.payout,
    activeAt: v.approved ? v.activeAt : null,
    capPerPayment: formatTokenYen(v.capPerPayment, decimals),
    capPerPeriod: formatTokenYen(v.capPerPeriod, decimals),
    remainingInPeriod: formatTokenYen(v.remainingInPeriod, decimals),
  };
}

function incomplete(reasons: Reason[]): KernelResult {
  return { status: "incomplete", ok: false, intent: null, payee: null, vendor: null, checks: [], reasons, blockNumber: null };
}

/** An RPC failure is not a verdict: report it as its own blocking reason and never guess the chain state. */
function unavailable(earlier: Reason[], error: unknown): KernelResult {
  process.stderr.write(`[agent] chain read failed: ${error instanceof Error ? error.name : "error"}\n`);
  const reason: Reason = {
    code: "chain_unavailable",
    severity: "block",
    layer: "kernel",
    tNumber: null,
    legalName: null,
    message: "The chain could not be read, so nothing can be verified or paid right now.",
  };
  const reasons = [...earlier, reason];
  return { status: "chain_unavailable", ok: false, intent: null, payee: null, vendor: null, checks: [], reasons, blockNumber: null };
}

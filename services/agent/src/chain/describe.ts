import { getAddress, isAddress } from "viem";
import { distinctShort, formatTokenYen, isoTime, payeeLabel, shortAddress } from "./format.js";
import type { RawRevert } from "./types.js";

/** A revert as the API returns it: the error name, its arguments as strings, and one plain sentence. */
export interface DecodedRevert {
  name: string;
  args: Record<string, string>;
  sentence: string;
}

export interface DescribeContext {
  decimals: number;
  /** The registry's legal name for a T-number, or null if it has none. */
  nameOf(tNumber: bigint): Promise<string | null>;
}

type Args = Record<string, unknown>;
type Sentence = (a: Args, label: string, yen: (v: unknown) => string) => string;

const short = (v: unknown) => shortAddress(String(v));

const SENTENCES: Record<string, Sentence> = {
  PayeeMismatch: (a, label) => {
    const [registered, asked] = distinctShort(String(a.registered), String(a.expected));
    return `${label} pays ${registered}; this invoice asked for ${asked}.`;
  },
  PayeeNotActive: (_, label) => `${label} is not an active payee in the Meigi registry (unregistered, or frozen by a dispute).`,
  VendorNotApproved: (_, label) =>
    `${label} is not on this vault's approved vendor list. Only the vault owner can add a vendor, and new vendors wait out a delay.`,
  VendorNotYetActive: (a, label) => `${label} was approved recently; the vault pays it only from ${isoTime(Number(a.activeAt))}.`,
  VendorPayoutChanged: (a, label) =>
    `${label}'s registered payout changed from ${short(a.approved)} to ${short(a.registered)}; the vault owner must re-approve it first.`,
  OverPaymentCap: (a, label, yen) => `${yen(a.amount)} is over the ${yen(a.cap)} per-payment cap for ${label}.`,
  OverPeriodCap: (a, label, yen) => `${yen(a.amount)} is more than the ${yen(a.remaining)} that ${label} can still receive this period.`,
  InvoiceAlreadyPaid: (a, label, yen) => `This invoice was already paid (${yen(a.paid)} to ${label}); a second payment is refused.`,
  NotAgent: (a) => `${short(a.caller)} is not this vault's agent key.`,
  EnforcedPause: () => "The vault owner has paused all payments.",
  ZeroAmount: () => "The amount is zero.",
  InvalidInvoiceRef: () => "The invoice reference is empty.",
  InvalidTNumber: () => "That is not a valid T-number.",
  ERC20InsufficientBalance: (a, _, yen) => `The vault holds ${yen(a.balance)}, but this payment needs ${yen(a.needed)}.`,
  Error: (a) => `The transaction would revert: ${String(a.reason)}.`,
  MandateNotLive: (a) =>
    `The agent's ENS mandate ${String(a.label)}.t${String(a.principal).padStart(13, "0")}.payee.eth doesn't answer: the buyer company revoked, froze or let it expire, so the agent may not pay.`,
  NotMandateHolder: (a) => `The ENS mandate names ${short(a.holder)}, not this agent's key ${short(a.caller)}.`,
  PrincipalNotActive: (a) => `The buyer company T${String(a.principal).padStart(13, "0")} is not active in the registry (disputed), so its mandate can't pay.`,
};

/** The MandateGate's own refusals: the buyer company's mandate, not the invoice, stopped the payment. */
export const MANDATE_ERRORS: ReadonlySet<string> = new Set(["MandateNotLive", "NotMandateHolder", "PrincipalNotActive"]);

export async function describeRevert(revert: RawRevert, ctx: DescribeContext): Promise<DecodedRevert> {
  const raw = namedArgs(revert);
  const tNumber = typeof raw.tNumber === "bigint" ? raw.tNumber : null;
  const legalName = tNumber === null ? null : await nameOrNull(ctx, tNumber);
  const label = tNumber === null ? "" : payeeLabel(tNumber, legalName);
  const yen = (v: unknown) => (typeof v === "bigint" ? formatTokenYen(v, ctx.decimals) : String(v));
  const sentence = SENTENCES[revert.name]?.(raw, label, yen) ?? `The transaction would revert with ${revert.name}.`;
  return { name: revert.name, args: displayArgs(raw), sentence };
}

async function nameOrNull(ctx: DescribeContext, tNumber: bigint): Promise<string | null> {
  try {
    return await ctx.nameOf(tNumber);
  } catch (error) {
    // The sentence still names the T-number; only the company name is missing.
    process.stderr.write(`[agent] registry name lookup failed: ${error instanceof Error ? error.name : "error"}\n`);
    return null;
  }
}

function namedArgs(revert: RawRevert): Args {
  const args: Args = {};
  revert.inputs.forEach((input, i) => {
    args[input.name || `arg${i}`] = revert.args[i];
  });
  return args;
}

function displayArgs(raw: Args): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const text = String(value);
    out[key] = typeof value === "string" && isAddress(text, { strict: false }) ? getAddress(text) : text;
  }
  return out;
}

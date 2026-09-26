import { getAddress, isAddress, type Address } from "viem";

/** Extension key merchants put in `PaymentRequired.extensions` to declare who they are. */
export const MEIGI_PAYEE_KEY = "meigi-payee";

/** The merchant's declaration: `{ "meigi-payee": { "tNumber": "T1010601051968" } }`. */
export interface MeigiPayeeDeclaration {
  tNumber: string;
  ens?: string;
}

export interface PayeeRecord {
  status: number; // 0 none, 1 active, 2 disputed
  legalName: string;
  payout: Address;
}

export interface ScreenResult {
  flagged: boolean;
  summary: string; // e.g. "toxicScore 87: known_scammer, fake_phishing_transfer"
}

export interface GuardDeps {
  /** Reads the Meigi registry. */
  payee(tNumber: bigint): Promise<PayeeRecord>;
  /** CAIP-2 network the registry vouches for, e.g. "eip155:11155111". Other networks are refused. */
  network: string;
  /** Optional counterparty screening (e.g. Intercepta). */
  screen?(address: Address): Promise<ScreenResult>;
  /**
   * Resolves an ENS name to an address, or null if it doesn't resolve. When provided, a merchant's declared
   * `ens` (if any) is checked against the registry as an independent, additional view; omit this to skip ENS
   * checking entirely (e.g. in tests, or callers that don't care), regardless of what a declaration contains.
   */
  resolveEns?(name: string): Promise<Address | null>;
}

export type GuardCode =
  | "no_declaration"
  | "invalid_declaration"
  | "network_mismatch"
  | "payee_not_active"
  | "payto_mismatch"
  | "ens_mismatch"
  | "ens_unresolved"
  | "screened"
  | "screening_unavailable"
  | "unverified_over_limit";

export type GuardVerdict =
  | { ok: true; tNumber: string; legalName: string; payTo: Address; screening?: ScreenResult }
  /** A merchant with no Meigi declaration, paid a small amount because screening cleared its payTo. */
  | { ok: true; unverified: true; payTo: Address; screening: ScreenResult }
  | { ok: false; code: GuardCode; reason: string; screening?: ScreenResult };

/** How an agent treats merchants that declare no Meigi payee. */
export interface UnverifiedPolicy {
  /** Screens the address such a merchant asks to be paid at, e.g. with Intercepta. */
  screen?: (address: Address) => Promise<ScreenResult>;
  /** Largest payment to such a merchant, in the asset's atomic units. */
  maxAmount: bigint;
}

const T_NUMBER = /^T?(\d{13})$/u;

export function parseDeclaration(declaration: unknown): string | null {
  const tNumber = (declaration as Partial<MeigiPayeeDeclaration> | null)?.tNumber;
  if (typeof tNumber !== "string") return null;
  return T_NUMBER.exec(tNumber.trim().toUpperCase())?.[1] ?? null;
}

function declaredEnsOf(declaration: unknown): string | undefined {
  const ens = (declaration as Partial<MeigiPayeeDeclaration> | null)?.ens;
  return typeof ens === "string" ? ens : undefined;
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** The ens name a declaration for `digits` must use: the same convention `meigiPayeeDeclaration()` emits. */
function expectedEnsName(digits: string): string {
  return `t${digits}.payee.eth`;
}

type EnsCheck = { ok: true } | { ok: false; code: "ens_mismatch" | "ens_unresolved"; reason: string };

/**
 * Only runs when `deps.resolveEns` is configured (see `GuardDeps`); a declaration with no `ens`, or a guard with
 * no resolver, is unaffected either way. When it does run, it must agree with both the registry and `payTo`,
 * not replace either: the declared name must be exactly this payee's own, and must resolve to the registered
 * payout. Comparing against `payTo` too (not just `payout`) is what catches a compromised server that swapped
 * `payTo` but can't touch the company's ENS name or its registry entry - `payto_mismatch` alone would also
 * catch that, but wouldn't name the ens name, which a reader would want to see first for this kind of attack.
 */
async function checkEns(deps: GuardDeps, digits: string, declaredEns: string | undefined, payout: Address, payTo: Address): Promise<EnsCheck> {
  if (!deps.resolveEns || declaredEns === undefined) return { ok: true };
  const expected = expectedEnsName(digits);
  if (declaredEns !== expected) {
    return { ok: false, code: "ens_mismatch", reason: `declared ens "${declaredEns}" is not ${expected}` };
  }
  let resolved: Address | null;
  try {
    resolved = await deps.resolveEns(expected);
  } catch {
    // Never surface the raw error: an RPC timeout or a UR revert can carry the resolver's URL in its message.
    return { ok: false, code: "ens_unresolved", reason: `${expected}: ENS lookup failed` };
  }
  if (!resolved) return { ok: false, code: "ens_unresolved", reason: `${expected} did not resolve to an address` };
  const address = getAddress(resolved);
  if (address !== payout) {
    return { ok: false, code: "ens_mismatch", reason: `${expected} resolves to ${short(address)}, not the registered payout ${short(payout)}` };
  }
  // ens agrees with the registry; payTo is the odd one out (e.g. a compromised server edited its own response).
  if (address !== payTo) {
    return {
      ok: false,
      code: "ens_mismatch",
      reason: `${expected} resolves to the registered payout ${short(address)}, but payTo asks for ${short(payTo)} instead`,
    };
  }
  return { ok: true };
}

/** Decides whether a buyer may sign a payment to `payTo` for a merchant that declared `declaration`. */
export async function checkPayee(
  deps: GuardDeps,
  declaration: unknown,
  requirements: { payTo: string; network: string },
): Promise<GuardVerdict> {
  const digits = parseDeclaration(declaration);
  if (!digits) return { ok: false, code: "invalid_declaration", reason: "merchant's meigi-payee declaration is malformed" };
  if (requirements.network !== deps.network) {
    return { ok: false, code: "network_mismatch", reason: `registry vouches for ${deps.network}, not ${requirements.network}` };
  }
  // Servers may send payTo in any case; the registry is the authority, so compare after normalising.
  if (!isAddress(requirements.payTo, { strict: false })) {
    return { ok: false, code: "payto_mismatch", reason: "payTo is not an address" };
  }

  const tNumber = `T${digits}`;
  const payTo = getAddress(requirements.payTo);
  // Screen the address actually requested, so a refusal can show both the registry and the screening signal.
  const [payee, screening] = await Promise.all([deps.payee(BigInt(digits)), deps.screen?.(payTo)]);
  if (payee.status !== 1) {
    const state = payee.status === 2 ? "disputed (payments frozen)" : "not registered";
    return { ok: false, code: "payee_not_active", reason: `${tNumber} is ${state}`, screening };
  }
  const payout = getAddress(payee.payout);
  // Checked before the plain payTo/payout comparison: a compromised server can swap payTo, but not the
  // company's ENS name, so a declared ens names the actual problem instead of just "payTo doesn't match".
  const ens = await checkEns(deps, digits, declaredEnsOf(declaration), payout, payTo);
  if (!ens.ok) return { ok: false, code: ens.code, reason: ens.reason, screening };
  if (payTo !== payout) {
    const reason = `payTo ${short(payTo)} is not ${payee.legalName} (${tNumber})'s registered payout ${short(payee.payout)}`;
    return { ok: false, code: "payto_mismatch", reason, screening };
  }
  if (screening?.flagged) {
    return { ok: false, code: "screened", reason: `screening flagged ${short(payTo)}: ${screening.summary}`, screening };
  }
  return { ok: true, tNumber, legalName: payee.legalName, payTo, screening };
}

function atomic(amount: string): bigint | null {
  return /^\d{1,78}$/u.test(amount) ? BigInt(amount) : null;
}

/**
 * Decides whether a buyer may pay a merchant that declared no Meigi payee: only up to `maxAmount`, and only
 * once screening has cleared `payTo`. No screener, a failed screening call or a flagged address refuses.
 */
export async function checkUndeclared(
  policy: UnverifiedPolicy,
  requirements: { payTo: string; amount: string },
): Promise<GuardVerdict> {
  if (!isAddress(requirements.payTo, { strict: false })) {
    return { ok: false, code: "payto_mismatch", reason: "payTo is not an address" };
  }
  const payTo = getAddress(requirements.payTo);
  const amount = atomic(requirements.amount);
  if (amount === null || amount > policy.maxAmount) {
    const reason = `merchant declares no Meigi payee; ${requirements.amount} is above the ${policy.maxAmount} allowed unverified`;
    return { ok: false, code: "unverified_over_limit", reason };
  }
  if (!policy.screen) {
    return { ok: false, code: "no_declaration", reason: "merchant declares no Meigi payee and no screening is configured" };
  }
  let screening: ScreenResult;
  try {
    screening = await policy.screen(payTo);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    return { ok: false, code: "screening_unavailable", reason: `merchant declares no Meigi payee and screening failed (${detail})` };
  }
  if (screening.flagged) {
    return { ok: false, code: "screened", reason: `screening flagged ${short(payTo)}: ${screening.summary}`, screening };
  }
  return { ok: true, unverified: true, payTo, screening };
}

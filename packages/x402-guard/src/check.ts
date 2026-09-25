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
}

export type GuardCode =
  | "no_declaration"
  | "invalid_declaration"
  | "network_mismatch"
  | "payee_not_active"
  | "payto_mismatch"
  | "screened";

export type GuardVerdict =
  | { ok: true; tNumber: string; legalName: string; payTo: Address }
  | { ok: false; code: GuardCode; reason: string };

const T_NUMBER = /^T?(\d{13})$/u;

export function parseDeclaration(declaration: unknown): string | null {
  const tNumber = (declaration as Partial<MeigiPayeeDeclaration> | null)?.tNumber;
  if (typeof tNumber !== "string") return null;
  return T_NUMBER.exec(tNumber.trim().toUpperCase())?.[1] ?? null;
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
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
  const payee = await deps.payee(BigInt(digits));
  if (payee.status !== 1) {
    const state = payee.status === 2 ? "disputed (payments frozen)" : "not registered";
    return { ok: false, code: "payee_not_active", reason: `${tNumber} is ${state}` };
  }
  const payTo = getAddress(requirements.payTo);
  if (payTo !== getAddress(payee.payout)) {
    return {
      ok: false,
      code: "payto_mismatch",
      reason: `payTo ${short(payTo)} is not ${payee.legalName} (${tNumber})'s registered payout ${short(payee.payout)}`,
    };
  }
  if (deps.screen) {
    const screened = await deps.screen(payTo);
    if (screened.flagged) return { ok: false, code: "screened", reason: `screening flagged ${short(payTo)}: ${screened.summary}` };
  }
  return { ok: true, tNumber, legalName: payee.legalName, payTo };
}

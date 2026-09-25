import { promises as dns } from "node:dns";
import { verifyMessage, type Address, type Hex } from "viem";

/**
 * Keybase-style proof of domain control. The business's controller wallet signs
 * `meigi-verify:{domain}:{T-number}:{nonce}` and publishes `meigi-sig=<signature>` as a TXT record at
 * `_meigi.{domain}`. `https://{domain}/.well-known/meigi.json` ({ "signature": "0x…" }) is the fallback
 * while DNS propagates.
 */

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;
export const TXT_PREFIX = "meigi-sig=";

export interface DomainProofInput {
  domain: string;
  tNumber: string; // "T" + 13 digits
  nonce: string;
  controller: Address;
}

export interface DomainProofDeps {
  resolveTxt: (name: string) => Promise<string[][]>;
  fetch: typeof fetch;
}

export type DomainProofResult =
  | { ok: true; method: "dns" | "well-known" }
  | { ok: false; reason: "no_proof_found" | "signature_mismatch" };

const defaultDeps: DomainProofDeps = { resolveTxt: (name) => dns.resolveTxt(name), fetch: globalThis.fetch };

/** Lower-cases and validates a public hostname. Returns null for IPs, localhost, or anything malformed. */
export function normalizeDomain(input: string): string | null {
  const domain = input.trim().toLowerCase().replace(/\.$/u, "");
  return HOSTNAME.test(domain) ? domain : null;
}

export function domainProofMessage(domain: string, tNumber: string, nonce: string): string {
  return `meigi-verify:${domain}:${tNumber}:${nonce}`;
}

export function txtRecordName(domain: string): string {
  return `_meigi.${domain}`;
}

export async function verifyDomainProof(
  input: DomainProofInput,
  deps: DomainProofDeps = defaultDeps,
): Promise<DomainProofResult> {
  const message = domainProofMessage(input.domain, input.tNumber, input.nonce);
  const fromDns = await signaturesFromDns(input.domain, deps);
  if (await anyValid(fromDns, message, input.controller)) return { ok: true, method: "dns" };

  const fromWellKnown = await signatureFromWellKnown(input.domain, deps);
  if (fromWellKnown && (await anyValid([fromWellKnown], message, input.controller))) {
    return { ok: true, method: "well-known" };
  }
  const sawProof = fromDns.length > 0 || fromWellKnown !== null;
  return { ok: false, reason: sawProof ? "signature_mismatch" : "no_proof_found" };
}

async function signaturesFromDns(domain: string, deps: DomainProofDeps): Promise<Hex[]> {
  let records: string[][];
  try {
    records = await deps.resolveTxt(txtRecordName(domain));
  } catch (error) {
    if (isMissingRecord(error)) return [];
    throw error;
  }
  return records
    .map((chunks) => chunks.join(""))
    .filter((value) => value.startsWith(TXT_PREFIX))
    .map((value) => value.slice(TXT_PREFIX.length) as Hex);
}

async function signatureFromWellKnown(domain: string, deps: DomainProofDeps): Promise<Hex | null> {
  let response: Response;
  try {
    response = await deps.fetch(`https://${domain}/.well-known/meigi.json`, {
      redirect: "error", // never follow a redirect to another host
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return null; // unreachable site or no HTTPS: the fallback simply isn't available
  }
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  const signature = (body as { signature?: unknown } | null)?.signature;
  return typeof signature === "string" && SIGNATURE.test(signature) ? (signature as Hex) : null;
}

async function anyValid(signatures: Hex[], message: string, controller: Address): Promise<boolean> {
  for (const signature of signatures) {
    if (!SIGNATURE.test(signature)) continue;
    if (await verifyMessage({ address: controller, message, signature })) return true;
  }
  return false;
}

function isMissingRecord(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

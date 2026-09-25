import { shortAddress } from "../chain/format.js";
import { nameKey } from "../extract/fields.js";
import type { KernelInput } from "./checks.js";
import type { CheckResult } from "./reasons.js";

/** Checks of the document against the chain that `payInvoice` itself can't make. */

// x402 `network` spellings that mean the chain this vault is on.
const NETWORKS: Record<number, string[]> = {
  11155111: ["sepolia", "ethereum-sepolia", "eip155:11155111"],
  31337: ["anvil", "localhost", "hardhat", "eip155:31337"],
};

export function documentChecks(input: KernelInput, label: string): CheckResult[] {
  return [nameCheck(input, label), ...x402Checks(input)].filter((check): check is CheckResult => check !== null);
}

/**
 * The company printed next to the T-number should be the registered one; otherwise another vendor's
 * T-number may have been used (by mistake or on purpose). A warning: English documents print English names.
 */
function nameCheck({ snapshot, document }: KernelInput, label: string): CheckResult | null {
  const { payee } = snapshot;
  if (payee.status !== "active" || !payee.legalName || !document.claimedName) return null;
  if (nameKey(document.claimedName) === nameKey(payee.legalName)) {
    return { code: "name_matches", ok: true, severity: "warn", message: `The document is issued in ${payee.legalName}'s registered name.` };
  }
  const message = `The company name printed on the document is not ${label}'s registered name.`;
  return { code: "name_differs", ok: false, severity: "warn", message, evidence: document.claimedName };
}

/** A 402 response must ask for the vault's own token on the vault's own chain, or its amount means nothing here. */
function x402Checks({ document, chain }: KernelInput): CheckResult[] {
  const x402 = document.x402;
  if (!x402) return [];
  const checks: CheckResult[] = [];
  if (x402.asset?.toLowerCase() !== chain.token.toLowerCase()) {
    const message = `The 402 response asks for another token than the vault's (${shortAddress(chain.token)}), so its amount can't be paid from this vault.`;
    checks.push({ code: "x402_asset_mismatch", ok: false, severity: "block", message });
  }
  if (!NETWORKS[chain.chainId]?.includes((x402.network ?? "").toLowerCase())) {
    checks.push({ code: "x402_network_mismatch", ok: false, severity: "block", message: "The 402 response is for another network than this vault's." });
  }
  return checks;
}

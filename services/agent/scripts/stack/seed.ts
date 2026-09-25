import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { agentVaultAbi, mockJPYCAbi, payeeRegistryAbi } from "@meigi/abi";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  http,
  keccak256,
  pad,
  parseUnits,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { Deployment } from "./deploy.js";

export interface DemoVendor {
  tNumber: string;
  legalName: string;
  payout: Address;
  approve: { capPerPayment: string; capPerPeriod: string } | null;
}

export const DEMO_MANIFEST = fileURLToPath(new URL("../demo-invoices/vendors.json", import.meta.url));

export function demoVendors(): DemoVendor[] {
  return (JSON.parse(readFileSync(DEMO_MANIFEST, "utf8")) as { vendors: DemoVendor[] }).vendors;
}

export interface SeedOptions {
  rpcUrl: string;
  deployment: Deployment;
  attesterKey: Hex;
  vaultOwnerKey: Hex;
  controller: Address; // the vendors' business key (unused by the agent)
  vendors: DemoVendor[];
  fundYen: string; // minted into the vault
}

// Test-fixture officer ids (sorted ascending), as in contracts/script/ens/SeedDemoPayee.s.sol.
const OFFICERS: Hex[] = [pad("0xa1", { size: 32 }), pad("0xb2", { size: 32 })];

/**
 * The demo world on a local chain: the attester registers every vendor, the vault owner approves the
 * ones marked `approve`, MockJPYC is minted into the vault, and time moves past the vendor delay.
 */
export async function seedDemo(opts: SeedOptions): Promise<void> {
  const transport = http(opts.rpcUrl);
  const reader = createPublicClient({ chain: foundry, transport });
  const attester = createWalletClient({ chain: foundry, transport, account: privateKeyToAccount(opts.attesterKey) });
  const owner = createWalletClient({ chain: foundry, transport, account: privateKeyToAccount(opts.vaultOwnerKey) });
  const confirm = async (hash: Hex) => {
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`seed transaction ${hash} reverted`);
  };
  const decimals = await reader.readContract({ address: opts.deployment.token, abi: mockJPYCAbi, functionName: "decimals" });
  for (const vendor of opts.vendors) {
    const tNumber = BigInt(vendor.tNumber.replace(/^T/u, ""));
    const registration = {
      tNumber,
      legalName: vendor.legalName,
      controller: opts.controller,
      payout: vendor.payout,
      officers: OFFICERS,
      threshold: 1,
      evidence: keccak256(toBytes("nta-exact-match|dns-txt|world-id")),
    };
    await confirm(await attester.writeContract({ address: opts.deployment.registry, abi: payeeRegistryAbi, functionName: "register", args: [registration] }));
    if (!vendor.approve) continue;
    const perPayment = parseUnits(vendor.approve.capPerPayment, decimals);
    const perPeriod = parseUnits(vendor.approve.capPerPeriod, decimals);
    const args = [tNumber, vendor.payout, perPayment, perPeriod] as const; // the owner pins the payout they reviewed
    await confirm(await owner.writeContract({ address: opts.deployment.vault, abi: agentVaultAbi, functionName: "approveVendor", args }));
  }
  const fund = parseUnits(opts.fundYen, decimals);
  await confirm(await owner.writeContract({ address: opts.deployment.token, abi: mockJPYCAbi, functionName: "mint", args: [opts.deployment.vault, fund] }));
  const delay = await reader.readContract({ address: opts.deployment.vault, abi: agentVaultAbi, functionName: "vendorDelay" });
  const test = createTestClient({ chain: foundry, mode: "anvil", transport });
  await test.increaseTime({ seconds: Number(delay) + 1 });
  await test.mine({ blocks: 1 });
}

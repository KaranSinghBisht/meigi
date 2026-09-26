import { defineChain, parseGwei, type Address, type Chain } from "viem";
import { sepolia } from "viem/chains";
import type { Config } from "./config.js";

/**
 * Where the demo's payments settle.
 * - Sepolia: mock JPYC, and the merchant's declared ENS name is checked against the registry too.
 * - Mizuhiki's Awaji testnet (X402_CHAIN=awaji): Mizuhiki's own MJPY, and the registry alone, since ENS isn't on Awaji.
 */
export interface Rail {
  readonly name: "sepolia" | "awaji";
  readonly network: `eip155:${number}`;
  readonly chain: Chain;
  readonly rpcUrl: string;
  readonly registry: Address;
  /** The payment token, with the EIP-712 domain its EIP-3009 authorizations are signed under. */
  readonly asset: { readonly address: Address; readonly extra: { name: string; version: string }; readonly decimals: number };
  /** Whether ENS exists on this chain, so the merchant can declare a name and the buyer can resolve it. */
  readonly ens: boolean;
  /** A hosted x402 facilitator to settle through; unset, the demo's in-process facilitator settles. */
  readonly facilitatorUrl?: string;
}

/** Awaji's minimum priority fee is 30 gwei, though its own fee estimate comes back near zero. */
const AWAJI_TIP = parseGwei("31");

/** Awaji (chain 6497). */
export const awaji = defineChain({
  id: 6497,
  name: "Mizuhiki Awaji",
  nativeCurrency: { name: "MIZU", symbol: "MIZU", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.awaji.mizuhiki.io"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://awaji.blockscout.com" } },
  fees: {
    estimateFeesPerGas: async ({ block }) => ({
      maxPriorityFeePerGas: AWAJI_TIP,
      maxFeePerGas: (block.baseFeePerGas ?? 0n) * 2n + AWAJI_TIP,
    }),
  },
});

export function railOf(config: Config): Rail {
  if (config.X402_CHAIN === "awaji") {
    return {
      name: "awaji",
      network: "eip155:6497",
      chain: awaji,
      rpcUrl: config.AWAJI_RPC_URL,
      registry: config.AWAJI_REGISTRY_ADDRESS as Address,
      asset: { address: config.AWAJI_TOKEN_ADDRESS as Address, extra: { name: "Mizuhiki JPY", version: "2" }, decimals: 6 },
      ens: false,
      facilitatorUrl: config.AWAJI_FACILITATOR_URL,
    };
  }
  return {
    name: "sepolia",
    network: "eip155:11155111",
    chain: sepolia,
    rpcUrl: config.SEPOLIA_RPC_URL,
    registry: config.REGISTRY_ADDRESS as Address,
    asset: { address: config.TOKEN_ADDRESS as Address, extra: { name: "Mock JPY Coin", version: "1" }, decimals: 18 },
    ens: true,
  };
}

/** An amount in whole yen, in the rail's token units (mock JPYC has 18 decimals, MJPY 6). */
export function yen(rail: Rail, amount: number): bigint {
  return BigInt(amount) * 10n ** BigInt(rail.asset.decimals);
}

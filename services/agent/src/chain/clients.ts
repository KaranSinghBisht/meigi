import { createPublicClient, http, type Chain, type PublicClient } from "viem";
import { foundry, sepolia } from "viem/chains";

export function chainFor(chainId: number): Chain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === foundry.id) return foundry;
  throw new Error(`unsupported chain id ${chainId}`);
}

/** One JSON-RPC transport, batched so a snapshot's reads share a round trip. Read-only: the agent has no wallet. */
export function createClients(rpcUrl: string, chainId: number) {
  const chain = chainFor(chainId);
  const transport = http(rpcUrl, { batch: true, timeout: 15_000 });
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  return { chain, publicClient };
}

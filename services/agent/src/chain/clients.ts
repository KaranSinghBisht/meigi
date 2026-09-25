import { createPublicClient, createWalletClient, http, type Chain, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";

export function chainFor(chainId: number): Chain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === foundry.id) return foundry;
  throw new Error(`unsupported chain id ${chainId}`);
}

/** One JSON-RPC transport (batched, so a snapshot's reads share a round trip) and the agent's wallet. */
export function createClients(rpcUrl: string, chainId: number, agentKey: Hex) {
  const chain = chainFor(chainId);
  const transport = http(rpcUrl, { batch: true, timeout: 15_000 });
  const account = privateKeyToAccount(agentKey);
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  const walletClient = createWalletClient({ chain, transport, account });
  return { chain, account, publicClient, walletClient };
}

import { createPublicClient, fallback, http, type Chain, type PublicClient, type Transport } from "viem";
import { foundry, sepolia } from "viem/chains";

export function chainFor(chainId: number): Chain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === foundry.id) return foundry;
  throw new Error(`unsupported chain id ${chainId}`);
}

/**
 * The JSON-RPC transport, batched so a snapshot's reads share a round trip. With a fallback URL, a read that fails on
 * the primary (a timeout, a connection error, an HTTP error such as a Cloudflare 403) is retried there once.
 */
export function rpcTransport(rpcUrl: string, fallbackUrl?: string): Transport {
  if (!fallbackUrl) return http(rpcUrl, { batch: true, timeout: 15_000 });
  const one = (url: string) => http(url, { batch: true, timeout: 15_000, retryCount: 1 });
  return fallback([one(rpcUrl), one(fallbackUrl)]);
}

/** Read-only: the agent has no wallet. */
export function createClients(rpcUrl: string, chainId: number, fallbackUrl?: string) {
  const chain = chainFor(chainId);
  const publicClient = createPublicClient({ chain, transport: rpcTransport(rpcUrl, fallbackUrl) }) as PublicClient;
  return { chain, publicClient };
}

import type { Address, PublicClient } from "viem";

/**
 * Resolves ENS names with stock viem: no custom `universalResolverAddress`, so it goes through whatever
 * Universal Resolver the client's chain config points at by default (the official one, not a hackathon fork).
 */
export function ensResolver(client: PublicClient) {
  return async function resolveEns(name: string): Promise<Address | null> {
    return client.getEnsAddress({ name });
  };
}

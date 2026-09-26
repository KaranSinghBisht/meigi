import { payeeRegistryAbi } from "@meigi/abi";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  fallback,
  http,
  keccak256,
  publicActions,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
  type TransactionSerializableEIP1559,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";
import { broadcast, type BroadcastRpc } from "./broadcast.js";
import type { Config } from "../config.js";
import type { SignedApproval } from "./approvals.js";

export interface PayeeState {
  status: number; // 0 none, 1 active, 2 disputed
  legalName: string;
  controller: Address;
  payout: Address;
  pending: Address;
  nextController: Address;
  nonce: bigint;
  threshold: number;
}

export interface RegistrationArgs {
  tNumber: bigint;
  legalName: string;
  controller: Address;
  payout: Address;
  officers: Hex[];
  threshold: number;
  evidence: Hex;
}

/** Everything the verifier reads from or writes to the registry, as the attester. */
export interface ChainPort {
  chainId: number;
  registry: Address;
  attester: LocalAccount;
  payee(tNumber: bigint): Promise<PayeeState>;
  officers(tNumber: bigint): Promise<Hex[]>;
  register(args: RegistrationArgs): Promise<Hex>;
  fileDispute(tNumber: bigint, claimant: Address, evidence: Hex): Promise<Hex>;
  cancelPayoutChange(tNumber: bigint): Promise<Hex>;
  cancelRotation(tNumber: bigint): Promise<Hex>;
  relayRotation(tNumber: bigint, newController: Address, approval: SignedApproval): Promise<Hex>;
}

function chainFor(chainId: number): Chain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === foundry.id) return foundry;
  throw new Error(`unsupported chain id ${chainId}`);
}

/** A short timeout with no built-in retries on each RPC in fallback mode, so a hanging publicnode fails over in
 * seconds, not the ~30-40s viem would otherwise wait through its own retry backoff before giving up. */
const FALLBACK_TIMEOUT_MS = 4_000;

/**
 * Reads retry on the fallback RPC on any transport error (a hackathon venue shares one IP; publicnode has
 * already 403'd this machine under that load). `fallbackUrl` is optional: reads use `rpcUrl` alone, with viem's
 * normal timeout/retries, when unset.
 */
export function readTransportFor(rpcUrl: string, fallbackUrl: string | undefined) {
  if (!fallbackUrl) return http(rpcUrl);
  const bounded = (url: string) => http(url, { timeout: FALLBACK_TIMEOUT_MS, retryCount: 0 });
  return fallback([bounded(rpcUrl), bounded(fallbackUrl)]);
}

export function createChainPort(config: Config): ChainPort {
  const chain = chainFor(config.CHAIN_ID);
  const attester = privateKeyToAccount(config.ATTESTER_PRIVATE_KEY as Hex);
  const rpcUrls = [config.SEPOLIA_RPC_URL, ...(config.SEPOLIA_RPC_FALLBACK_URL ? [config.SEPOLIA_RPC_FALLBACK_URL] : [])];
  const reader = createPublicClient({ chain, transport: readTransportFor(config.SEPOLIA_RPC_URL, config.SEPOLIA_RPC_FALLBACK_URL) });
  // Preparing a transaction (nonce, gas, fees - all reads) is safe to retry and fail over freely, so it goes
  // through the same fallback-aware transport as `reader`.
  const preparer = createWalletClient({ chain, transport: readTransportFor(config.SEPOLIA_RPC_URL, config.SEPOLIA_RPC_FALLBACK_URL), account: attester });
  // Broadcasting deliberately doesn't go through viem's fallback transport: its default retries ANY method on a
  // transport error, including eth_sendRawTransaction, which would blindly resend an already-broadcast signed tx
  // to the other RPC. `broadcast()` (services/verifier/src/registry/broadcast.ts, mirroring the signer's own)
  // handles that explicitly instead, one already-signed send at a time, never signing twice. Each RPC still gets
  // the same short timeout and no built-in retries when a fallback is configured, so a hanging primary hands off
  // to broadcast()'s own failover in seconds rather than waiting out viem's default retry backoff first.
  const broadcastTransport = (url: string) =>
    config.SEPOLIA_RPC_FALLBACK_URL ? http(url, { timeout: FALLBACK_TIMEOUT_MS, retryCount: 0 }) : http(url);
  const broadcasters: BroadcastRpc[] = rpcUrls.map((url) =>
    createWalletClient({ chain, transport: broadcastTransport(url), account: attester }).extend(publicActions),
  );
  const registry = config.REGISTRY_ADDRESS as Address;
  const base = { account: attester, address: registry, abi: payeeRegistryAbi } as const;

  /** Simulates first, so reverts surface as decoded contract errors, then sends and waits. */
  async function confirm(hash: Hex): Promise<Hex> {
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
    return hash;
  }

  /** Signs the call locally first, so the transaction hash is known before any network call, then sends it. */
  async function sendAndConfirm(request: { functionName: string; args: readonly unknown[] }): Promise<Hex> {
    const data = encodeFunctionData({ abi: payeeRegistryAbi, functionName: request.functionName, args: request.args } as Parameters<
      typeof encodeFunctionData
    >[0]);
    const prepared = await preparer.prepareTransactionRequest({ account: attester, chain, to: registry, data, type: "eip1559" });
    // The node reporting a different chain id than ours would sign a transaction for the wrong chain entirely.
    if (prepared.chainId !== chain.id) {
      throw new Error(`RPC reported chain id ${prepared.chainId}, expected ${chain.id}; refusing to sign`);
    }
    const serializedTransaction = await attester.signTransaction(prepared as TransactionSerializableEIP1559);
    return confirm(await broadcast(broadcasters, serializedTransaction));
  }

  return {
    chainId: chain.id,
    registry,
    attester,
    async payee(tNumber) {
      const v = await reader.readContract({ ...base, functionName: "payeeOf", args: [tNumber] });
      return {
        status: Number(v.status),
        legalName: v.legalName,
        controller: v.controller,
        payout: v.payout,
        pending: v.pending,
        nextController: v.nextController,
        nonce: v.nonce,
        threshold: Number(v.threshold),
      };
    },
    async officers(tNumber) {
      return [...(await reader.readContract({ ...base, functionName: "officersOf", args: [tNumber] }))];
    },
    async register(a) {
      const registration = { ...a, threshold: a.threshold };
      const { request } = await reader.simulateContract({ ...base, functionName: "register", args: [registration] });
      return sendAndConfirm(request);
    },
    async fileDispute(tNumber, claimant, evidence) {
      const args = [tNumber, claimant, evidence] as const;
      const { request } = await reader.simulateContract({ ...base, functionName: "fileDispute", args });
      return sendAndConfirm(request);
    },
    async cancelPayoutChange(tNumber) {
      const { request } = await reader.simulateContract({ ...base, functionName: "cancelPayoutChange", args: [tNumber] });
      return sendAndConfirm(request);
    },
    async cancelRotation(tNumber) {
      const args = [tNumber] as const;
      const { request } = await reader.simulateContract({ ...base, functionName: "cancelControllerRotation", args });
      return sendAndConfirm(request);
    },
    async relayRotation(tNumber, newController, approval) {
      const args = [tNumber, newController, approval] as const;
      const { request } = await reader.simulateContract({ ...base, functionName: "requestControllerRotation", args });
      return sendAndConfirm(request);
    },
  };
}

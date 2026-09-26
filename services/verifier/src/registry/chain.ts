import { payeeRegistryAbi } from "@meigi/abi";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  fallback,
  http,
  keccak256,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
  type TransactionSerializableEIP1559,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";
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

/**
 * Reads retry on the fallback RPC on any transport error (a hackathon venue shares one IP; publicnode has
 * already 403'd this machine under that load). `fallbackUrl` is optional: reads use `rpcUrl` alone when unset.
 */
export function readTransportFor(rpcUrl: string, fallbackUrl: string | undefined) {
  return fallbackUrl ? fallback([http(rpcUrl), http(fallbackUrl)]) : http(rpcUrl);
}

/**
 * Sends an already-signed transaction, tolerating a transport error on `send` if `hash` turns out to already be
 * known (by either RPC, when `isKnown` is backed by a fallback-aware reader). A dropped connection doesn't tell
 * us whether the RPC had already broadcast the transaction before it dropped, so re-sending the same signed tx
 * elsewhere would be redundant at best - this checks by hash instead, and only re-throws once neither RPC has
 * it. Exported and parameterised over `send`/`isKnown` so this decision is tested directly, without a real chain.
 */
export async function sendKnown(hash: Hex, send: () => Promise<Hex>, isKnown: (hash: Hex) => Promise<boolean>): Promise<Hex> {
  try {
    await send();
  } catch (error) {
    if (!(await isKnown(hash))) throw error;
  }
  return hash;
}

export function createChainPort(config: Config): ChainPort {
  const chain = chainFor(config.CHAIN_ID);
  const attester = privateKeyToAccount(config.ATTESTER_PRIVATE_KEY as Hex);
  const reader = createPublicClient({ chain, transport: readTransportFor(config.SEPOLIA_RPC_URL, config.SEPOLIA_RPC_FALLBACK_URL) });
  // Writes deliberately don't get the fallback-wrapped transport: its default retries ANY method on a transport
  // error, including eth_sendRawTransaction, which would blindly resend an already-broadcast signed tx to the
  // other RPC. sendKnown (used below) handles that case explicitly instead.
  const writer = createWalletClient({ chain, transport: http(config.SEPOLIA_RPC_URL), account: attester });
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
    const prepared = await writer.prepareTransactionRequest({ account: attester, chain, to: registry, data, type: "eip1559" });
    const serializedTransaction = await attester.signTransaction(prepared as TransactionSerializableEIP1559);
    const hash = keccak256(serializedTransaction);
    const isKnown = async (h: Hex) => {
      try {
        return (await reader.getTransaction({ hash: h })) !== null;
      } catch {
        return false; // neither RPC recognised it (or neither answered): can't confirm it landed
      }
    };
    await sendKnown(hash, () => writer.sendRawTransaction({ serializedTransaction }), isKnown);
    return confirm(hash);
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

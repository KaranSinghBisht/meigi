import { payeeRegistryAbi } from "@meigi/abi";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hex,
  type LocalAccount,
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

export function createChainPort(config: Config): ChainPort {
  const chain = chainFor(config.CHAIN_ID);
  const transport = http(config.SEPOLIA_RPC_URL);
  const attester = privateKeyToAccount(config.ATTESTER_PRIVATE_KEY as Hex);
  const reader = createPublicClient({ chain, transport });
  const writer = createWalletClient({ chain, transport, account: attester });
  const registry = config.REGISTRY_ADDRESS as Address;
  const base = { account: attester, address: registry, abi: payeeRegistryAbi } as const;

  /** Simulates first, so reverts surface as decoded contract errors, then sends and waits. */
  async function confirm(hash: Hex): Promise<Hex> {
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
    return hash;
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
      return confirm(await writer.writeContract(request));
    },
    async fileDispute(tNumber, claimant, evidence) {
      const args = [tNumber, claimant, evidence] as const;
      const { request } = await reader.simulateContract({ ...base, functionName: "fileDispute", args });
      return confirm(await writer.writeContract(request));
    },
    async cancelPayoutChange(tNumber) {
      const { request } = await reader.simulateContract({ ...base, functionName: "cancelPayoutChange", args: [tNumber] });
      return confirm(await writer.writeContract(request));
    },
    async cancelRotation(tNumber) {
      const args = [tNumber] as const;
      const { request } = await reader.simulateContract({ ...base, functionName: "cancelControllerRotation", args });
      return confirm(await writer.writeContract(request));
    },
    async relayRotation(tNumber, newController, approval) {
      const args = [tNumber, newController, approval] as const;
      const { request } = await reader.simulateContract({ ...base, functionName: "requestControllerRotation", args });
      return confirm(await writer.writeContract(request));
    },
  };
}

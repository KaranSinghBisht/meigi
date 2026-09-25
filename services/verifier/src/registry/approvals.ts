import {
  encodeAbiParameters,
  hashTypedData,
  keccak256,
  pad,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";

/** EIP-712 officer approvals, byte-for-byte compatible with contracts/src/registry/OfficerQuorum.sol. */

export const Action = { PayoutChange: 0, ControllerRotation: 1, OfficerUpdate: 2 } as const;
export type ActionName = keyof typeof Action;

export const APPROVAL_TYPES = {
  OfficerApproval: [
    { name: "tNumber", type: "uint64" },
    { name: "action", type: "uint8" },
    { name: "target", type: "bytes32" },
    { name: "officerIds", type: "bytes32[]" },
    { name: "nonce", type: "uint64" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface ApprovalRequest {
  chainId: number;
  registry: Address;
  tNumber: bigint;
  action: ActionName;
  target: Hex;
  officerIds: Hex[];
  nonce: bigint;
  deadline: bigint;
}

/** The struct the registry takes: `(bytes32[] officerIds, uint256 deadline, bytes signature)`. */
export interface SignedApproval {
  officerIds: Hex[];
  deadline: bigint;
  signature: Hex;
}

/** Officer ids must be sorted ascending and distinct (the contract rejects anything else). */
export function sortOfficerIds(ids: readonly Hex[]): Hex[] {
  const sorted = [...ids].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
  for (let i = 1; i < sorted.length; i++) {
    if (BigInt(sorted[i]!) === BigInt(sorted[i - 1]!)) throw new Error("duplicate officer id");
  }
  return sorted;
}

/** `bytes32(uint256(uint160(account)))`: the target for payout changes and controller rotations. */
export function addressTarget(account: Address): Hex {
  return pad(account, { size: 32 });
}

/** `keccak256(abi.encode(officers, threshold))`: the target for officer-set updates. */
export function officerUpdateTarget(officers: readonly Hex[], threshold: number): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32[]" }, { type: "uint8" }], [officers, threshold]));
}

export function approvalTypedData(req: ApprovalRequest) {
  return {
    domain: { name: "MeigiPayeeRegistry", version: "1", chainId: req.chainId, verifyingContract: req.registry },
    types: APPROVAL_TYPES,
    primaryType: "OfficerApproval" as const,
    message: {
      tNumber: req.tNumber,
      action: Action[req.action],
      target: req.target,
      officerIds: req.officerIds,
      nonce: req.nonce,
      deadline: req.deadline,
    },
  };
}

export function approvalDigest(req: ApprovalRequest): Hex {
  return hashTypedData(approvalTypedData(req));
}

export async function signApproval(attester: LocalAccount, req: ApprovalRequest): Promise<SignedApproval> {
  const officerIds = sortOfficerIds(req.officerIds);
  const signature = await attester.signTypedData(approvalTypedData({ ...req, officerIds }));
  return { officerIds, deadline: req.deadline, signature };
}

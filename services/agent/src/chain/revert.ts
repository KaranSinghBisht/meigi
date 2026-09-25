import { agentVaultAbi, mockJPYCAbi, payeeRegistryAbi } from "@meigi/abi";
import {
  BaseError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Abi,
  type DecodeErrorResultReturnType,
} from "viem";
import type { RawRevert } from "./types.js";

/**
 * Every custom error a payment can surface: the vault's own, the registry's (via PayeeGuard), and the
 * token's (SafeERC20 bubbles e.g. ERC20InsufficientBalance up unchanged).
 */
const ERRORS: Abi = ([...agentVaultAbi, ...payeeRegistryAbi, ...mockJPYCAbi] as Abi).filter((item) => item.type === "error");

/** Pulls the decoded custom error out of a viem error, or null if the failure wasn't a contract revert. */
export function revertOf(error: unknown): RawRevert | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  if (reverted.data?.abiItem) return fromDecoded(reverted.data);
  if (reverted.raw && reverted.raw !== "0x") return decodeRaw(reverted.raw);
  if (reverted.reason) return { name: "Error", inputs: [{ name: "reason", type: "string" }], args: [reverted.reason] };
  return { name: "UnknownRevert", inputs: [], args: [] };
}

/** Decodes raw revert data against every Meigi ABI. */
export function decodeRaw(data: `0x${string}`): RawRevert {
  try {
    return fromDecoded(decodeErrorResult({ abi: ERRORS, data }));
  } catch {
    // An error selector none of our contracts define: report the raw data rather than guess.
    return { name: "UnknownRevert", inputs: [{ name: "data", type: "bytes" }], args: [data] };
  }
}

function fromDecoded(decoded: DecodeErrorResultReturnType): RawRevert {
  const inputs = decoded.abiItem && "inputs" in decoded.abiItem ? decoded.abiItem.inputs : [];
  return { name: decoded.errorName, inputs, args: decoded.args ?? [] };
}

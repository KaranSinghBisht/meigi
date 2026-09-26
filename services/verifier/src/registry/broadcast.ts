import { BaseError, keccak256, type Hex } from "viem";
import { isTransportError, wasSkipped } from "./rpc.js";

/**
 * Broadcasts one signed transaction across the configured RPCs (SEPOLIA_RPC_URL, then SEPOLIA_RPC_FALLBACK_URL)
 * without ever signing again. Its hash is known before anything is sent, so an error is settled by asking the RPCs
 * whether they have it:
 * - "already known", or an RPC that has the transaction, means it was sent;
 * - a transport error (timeout, connection, an HTTP error such as a Cloudflare 403) passes the same bytes to the next RPC;
 * - an RPC benched after a recent failure (rpc.ts) is passed over without asking anyone: nothing was sent to it;
 * - any other refusal (a nonce another transaction used, an underpriced fee, …) is final: not sent.
 *
 * Mirrors services/signer/src/broadcast.ts (copied rather than imported cross-package, to keep this scoped
 * under a time box) so the two behave the same.
 */

export interface BroadcastRpc {
  sendRawTransaction(args: { serializedTransaction: Hex }): Promise<Hex>;
  /** The transaction, or a throw when this RPC doesn't have it (or can't answer). */
  getTransaction(args: { hash: Hex }): Promise<unknown>;
}

// Anchored so that "unknown transaction" never counts as sent.
const ALREADY_KNOWN = /already known|\bknown transaction|alreadyknown/iu;

function isAlreadyKnown(error: unknown): boolean {
  return error instanceof BaseError ? error.walk((e) => e instanceof Error && ALREADY_KNOWN.test(e.message)) !== null : false;
}

/** Whether any RPC has this transaction. A lookup that fails is "not seen there", never "sent". */
async function seenAnywhere(rpcs: readonly BroadcastRpc[], hash: Hex): Promise<boolean> {
  for (const rpc of rpcs) {
    try {
      if (await rpc.getTransaction({ hash })) return true;
    } catch {
      // TransactionNotFound, or this RPC is down: try the next.
    }
  }
  return false;
}

export async function broadcast(rpcs: readonly BroadcastRpc[], serializedTransaction: Hex): Promise<Hex> {
  const hash = keccak256(serializedTransaction);
  let failure: unknown = new Error("no RPC to broadcast on");
  for (const rpc of rpcs) {
    try {
      await rpc.sendRawTransaction({ serializedTransaction });
      return hash;
    } catch (error) {
      failure = error;
      if (wasSkipped(error)) continue; // a benched RPC: these bytes never left this machine
      if (isAlreadyKnown(error) || (await seenAnywhere(rpcs, hash))) return hash;
      if (!isTransportError(error)) break; // the chain refused this transaction: another RPC won't take it either
    }
  }
  throw failure;
}

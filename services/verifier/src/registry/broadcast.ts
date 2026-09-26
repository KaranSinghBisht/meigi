import { BaseError, HttpRequestError, keccak256, TimeoutError, type Hex } from "viem";

/**
 * Broadcasts one signed transaction across the configured RPCs (SEPOLIA_RPC_URL, then SEPOLIA_RPC_FALLBACK_URL)
 * without ever signing again. Its hash is known before anything is sent, so an error is settled by asking the RPCs
 * whether they have it:
 * - "already known", or an RPC that has the transaction, means it was sent;
 * - a transport error (timeout, connection, an HTTP error such as a Cloudflare 403) passes the same bytes to the next RPC;
 * - any other refusal (a nonce another transaction used, an underpriced fee, …) is final: not sent.
 *
 * Mirrors services/signer/src/broadcast.ts (copied rather than imported cross-package, to keep this change
 * scoped to the verifier under a time box - same logic, same tests).
 */

export interface BroadcastRpc {
  sendRawTransaction(args: { serializedTransaction: Hex }): Promise<Hex>;
  /** The transaction, or a throw when this RPC doesn't have it (or can't answer). */
  getTransaction(args: { hash: Hex }): Promise<unknown>;
}

const ALREADY_KNOWN = /already known|known transaction|alreadyknown/iu;

function isTransportError(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  return error.walk((e) => e instanceof HttpRequestError || e instanceof TimeoutError) !== null;
}

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
      if (isAlreadyKnown(error) || (await seenAnywhere(rpcs, hash))) return hash;
      failure = error;
      if (!isTransportError(error)) break; // the chain refused this transaction: another RPC won't take it either
    }
  }
  throw failure;
}

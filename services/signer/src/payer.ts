import { agentVaultAbi, mandateGateAbi } from "@meigi/abi";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeFunctionData,
  TransactionReceiptNotFoundError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { broadcast, type BroadcastRpc } from "./broadcast.js";

/** The arguments of `AgentVault.payInvoice`, the one call this key may make. */
export interface PayCall {
  tNumber: bigint;
  expectedPayout: Address;
  amount: bigint;
  invoiceRef: Hex;
}

/** A contract revert, as raw data for the agent to decode against the Meigi ABIs, or a string reason. */
export type Revert = { data: Hex } | { reason: string } | { unknown: true };

export type Simulation = { ok: true; payout: Address } | { ok: false; revert: Revert };
/** A send, with the payout its in-lock simulation returned: null when it answered with a tx already in flight. */
export type Sent = { ok: true; txHash: Hex; payout: Address | null } | { ok: false; revert: Revert };

export interface Receipt {
  txHash: Hex;
  status: "success" | "reverted";
  blockNumber: bigint;
}

export interface SignerPayer {
  simulate(call: PayCall): Promise<Simulation>;
  /** Re-simulates inside the nonce lock and broadcasts only if that passes. Returns once the tx is sent. */
  send(call: PayCall): Promise<Sent>;
  receipt(txHash: Hex): Promise<Receipt | null>;
}

export interface PayerOptions {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  target: Address; // the vault, or the MandateGate in front of it (route.ts): the same payInvoice either way
  rpcs: readonly BroadcastRpc[]; // where a signed payment is broadcast: SEPOLIA_RPC_URL, then the fallback if set
}

// The gate's payInvoice has the vault's signature, plus its own errors (MandateNotLive, NotMandateHolder, …).
const PAY_ABI = [...agentVaultAbi, ...mandateGateAbi.filter((item) => item.type === "error")] as const;

/**
 * The agent key's only capability: `payInvoice` on the vault (or its MandateGate), simulated first, every time. Sends are serialised so two
 * payments never race for a nonce, and an invoice whose payment is in flight is never sent twice: the same send
 * answers with the transaction already sent.
 */
export function createPayer(opts: PayerOptions): SignerPayer {
  const exclusive = createLock();
  const inFlight = new Map<string, Hex>(); // "tNumber:invoiceRef" (the vault's invoice identity) → its tx, until mined
  const nonces: NonceMemory = { last: null };
  return {
    simulate: (call) => simulate(opts, call),
    send: (call) =>
      exclusive(async () => {
        const invoice = `${call.tNumber}:${call.invoiceRef.toLowerCase()}`;
        const sent = inFlight.get(invoice);
        if (sent) return { ok: true, txHash: sent, payout: null };
        const outcome = await simulate(opts, call);
        if (!outcome.ok) return outcome;
        const txHash = await signAndBroadcast(opts, call, nonces);
        inFlight.set(invoice, txHash);
        return { ok: true, txHash, payout: outcome.payout };
      }),
    async receipt(txHash) {
      const found = await receiptOf(opts, txHash);
      if (found) for (const [ref, hash] of inFlight) if (hash === txHash) inFlight.delete(ref);
      return found;
    },
  };
}

/** Signs the payment once, locally, and broadcasts those bytes (broadcast.ts): never a second signature. */
async function signAndBroadcast(opts: PayerOptions, call: PayCall, nonces: NonceMemory): Promise<Hex> {
  const data = encodeFunctionData({ abi: PAY_ABI, functionName: "payInvoice", args: [call.tNumber, call.expectedPayout, call.amount, call.invoiceRef] });
  const { account, chain } = opts.walletClient;
  const pending = await opts.publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
  const nonce = nextNonce(pending, nonces.last, Date.now());
  const request = await opts.walletClient.prepareTransactionRequest({ account, chain, to: opts.target, data, nonce });
  const serialized = await opts.walletClient.signTransaction(request);
  const txHash = await broadcast(opts.rpcs, serialized);
  nonces.last = { nonce, at: Date.now() };
  return txHash;
}

/** The last nonce this signer broadcast, and when. Sends are serialised, so one slot is enough. */
export interface NonceMemory {
  last: { nonce: number; at: number } | null;
}

export const NONCE_MEMORY_MS = 10 * 60_000;

/**
 * The nonce for the next payment. Reads fail over between RPCs whose pending pools can differ, and one that hasn't
 * seen our last transaction yet would hand its nonce out again, so never go below the last one sent + 1. The memory
 * lapses after NONCE_MEMORY_MS, so a transaction dropped from every pool can't hold back the ones after it for long.
 */
export function nextNonce(pending: number, last: NonceMemory["last"], now: number): number {
  if (!last || now - last.at > NONCE_MEMORY_MS) return pending;
  return Math.max(pending, last.nonce + 1);
}

async function simulate(opts: PayerOptions, call: PayCall) {
  try {
    const { request, result } = await opts.publicClient.simulateContract({
      address: opts.target,
      abi: PAY_ABI,
      functionName: "payInvoice",
      args: [call.tNumber, call.expectedPayout, call.amount, call.invoiceRef],
      account: opts.walletClient.account,
      chain: opts.walletClient.chain,
    });
    return { ok: true as const, payout: result, request };
  } catch (error) {
    const revert = revertOf(error);
    if (revert) return { ok: false as const, revert };
    throw error; // RPC or network failure: not a decision, so it must not look like one
  }
}

/** The raw revert data of a contract revert, or null if the failure wasn't one. */
export function revertOf(error: unknown): Revert | null {
  if (!(error instanceof BaseError)) return null;
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (!(reverted instanceof ContractFunctionRevertedError)) return null;
  if (reverted.raw && reverted.raw !== "0x") return { data: reverted.raw };
  if (reverted.reason) return { reason: reverted.reason };
  return { unknown: true };
}

async function receiptOf(opts: PayerOptions, txHash: Hex): Promise<Receipt | null> {
  try {
    const r = await opts.publicClient.getTransactionReceipt({ hash: txHash });
    return { txHash, status: r.status, blockNumber: r.blockNumber };
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) return null; // still pending
    throw error;
  }
}

/** A promise chain that runs tasks one at a time. */
function createLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined); // a failed task must not block the ones queued after it
    return run;
  };
}

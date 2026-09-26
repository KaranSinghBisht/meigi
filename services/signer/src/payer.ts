import { agentVaultAbi } from "@meigi/abi";
import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionReceiptNotFoundError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";

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
  vault: Address;
}

/**
 * The agent key's only capability: `AgentVault.payInvoice`, simulated first, every time. Sends are serialised so two
 * payments never race for a nonce, and an invoice whose payment is in flight is never sent twice: the same send
 * answers with the transaction already sent.
 */
export function createPayer(opts: PayerOptions): SignerPayer {
  const exclusive = createLock();
  const inFlight = new Map<Hex, Hex>(); // invoiceRef → the tx paying it, until it is mined
  return {
    simulate: (call) => simulate(opts, call),
    send: (call) =>
      exclusive(async () => {
        const sent = inFlight.get(call.invoiceRef);
        if (sent) return { ok: true, txHash: sent, payout: null };
        const outcome = await simulate(opts, call);
        if (!outcome.ok) return outcome;
        const txHash = await opts.walletClient.writeContract(outcome.request);
        inFlight.set(call.invoiceRef, txHash);
        return { ok: true, txHash, payout: outcome.payout };
      }),
    async receipt(txHash) {
      const found = await receiptOf(opts, txHash);
      if (found) for (const [ref, hash] of inFlight) if (hash === txHash) inFlight.delete(ref);
      return found;
    },
  };
}

async function simulate(opts: PayerOptions, call: PayCall) {
  try {
    const { request, result } = await opts.publicClient.simulateContract({
      address: opts.vault,
      abi: agentVaultAbi,
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

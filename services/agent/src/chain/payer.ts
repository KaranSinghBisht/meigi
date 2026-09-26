import { agentVaultAbi } from "@meigi/abi";
import {
  TransactionReceiptNotFoundError,
  WaitForTransactionReceiptTimeoutError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { revertOf } from "./revert.js";
import type { PayCall, PayerPort, PaymentReceipt, RawRevert, SendOutcome } from "./types.js";

export interface PayerOptions {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  vault: Address;
  receiptTimeoutMs?: number;
}

/**
 * The agent key's only capability: `AgentVault.payInvoice`. Every call is simulated first; a simulated revert
 * is returned (decoded) and nothing is broadcast. Sends are serialised so two payments never race for a nonce,
 * and a sent transaction is reported (onSent) before its receipt is awaited, so a slow block never hides it.
 */
export function createPayer(opts: PayerOptions): PayerPort {
  const exclusive = createLock();
  return {
    async simulate(call) {
      const outcome = await simulate(opts, call);
      return outcome.ok ? { ok: true, payout: outcome.payout } : outcome;
    },
    send: (call, onSent) => exclusive(() => simulateThenSend(opts, call, onSent)),
    receipt: (txHash) => receiptOf(opts, txHash),
  };
}

/** Returns the prepared request (its exact viem type is inferred) or the decoded revert. */
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
    const revert: RawRevert | null = revertOf(error);
    if (revert) return { ok: false as const, revert };
    throw error; // RPC or network failure: not a decision, so it must not look like one
  }
}

/** Re-simulates on the latest state, broadcasts only if that passes, then waits (bounded) for the receipt. */
async function simulateThenSend(opts: PayerOptions, call: PayCall, onSent?: (txHash: Hex) => void): Promise<SendOutcome> {
  const outcome = await simulate(opts, call);
  if (!outcome.ok) return outcome;
  const txHash = await opts.walletClient.writeContract(outcome.request);
  onSent?.(txHash);
  try {
    const mined = await opts.publicClient.waitForTransactionReceipt({ hash: txHash, timeout: opts.receiptTimeoutMs ?? 120_000 });
    return { ok: true, receipt: { txHash, status: mined.status, blockNumber: mined.blockNumber } };
  } catch (error) {
    if (error instanceof WaitForTransactionReceiptTimeoutError) return { ok: "pending", txHash };
    throw error;
  }
}

async function receiptOf(opts: PayerOptions, txHash: Hex): Promise<PaymentReceipt | null> {
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

import { agentVaultAbi, mockJPYCAbi } from "@meigi/abi";
import { getAbiItem, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import type { BlockRange, PaymentHistory, ReceivedTotal, SettledPayment } from "./types.js";

/** Blocks per eth_getLogs call: public RPCs cap the range. */
const CHUNK = 10_000n;

export interface RpcHistoryOptions {
  client: PublicClient;
  vault: Address;
  token: () => Promise<Address>;
  fromBlock: bigint; // the deployment block: nothing earlier is ours
}

/** The same settlement facts read straight from RPC logs: the fallback when MultiBaas is off or down. */
export function createRpcHistory(opts: RpcHistoryOptions): PaymentHistory {
  const invoicePaid = getAbiItem({ abi: agentVaultAbi, name: "InvoicePaid" });
  const transfer = getAbiItem({ abi: mockJPYCAbi, name: "Transfer" });
  return {
    source: "rpc",
    fromBlock: opts.fromBlock,
    async invoicesPaid(limit, range) {
      const logs = await chunked(opts, range, (fromBlock, toBlock) => opts.client.getLogs({ address: opts.vault, event: invoicePaid, fromBlock, toBlock, strict: true }));
      return logs
        .map((log): SettledPayment => ({ txHash: log.transactionHash, blockNumber: log.blockNumber, at: null, ...log.args }))
        .sort((a, b) => Number(b.blockNumber - a.blockNumber))
        .slice(0, limit);
    },
    async received(payouts, range) {
      if (payouts.length === 0) return [];
      const token = await opts.token();
      const logs = await chunked(opts, range, (fromBlock, toBlock) =>
        opts.client.getLogs({ address: token, event: transfer, args: { to: payouts }, fromBlock, toBlock, strict: true }),
      );
      const totals = new Map<Address, bigint>();
      for (const log of logs) totals.set(log.args.to, (totals.get(log.args.to) ?? 0n) + log.args.value);
      return [...totals].map(([payout, total]): ReceivedTotal => ({ payout, total }));
    },
    async settlementOf(txHash: Hex) {
      const receipt = await opts.client.getTransactionReceipt({ hash: txHash }).catch(() => null);
      if (!receipt) return null;
      const [paid] = parseEventLogs({ abi: agentVaultAbi, eventName: "InvoicePaid", logs: receipt.logs.filter((l) => l.address.toLowerCase() === opts.vault.toLowerCase()) });
      return paid ? { txHash, blockNumber: receipt.blockNumber, at: null, ...paid.args } : null;
    },
  };
}

async function chunked<T>(opts: RpcHistoryOptions, range: BlockRange | undefined, read: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  const head = await opts.client.getBlockNumber({ cacheTime: 0 }); // viem caches it; a payment just mined must count
  const latest = range?.toBlock !== undefined && range.toBlock < head ? range.toBlock : head;
  const out: T[] = [];
  for (let from = opts.fromBlock; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
    out.push(...(await read(from, to)));
  }
  return out;
}

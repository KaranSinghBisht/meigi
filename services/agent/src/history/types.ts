import type { Address, Hex } from "viem";

/** One InvoicePaid the vault emitted, or (on an indexed network) a Paid the PayRouter emitted. */
export interface SettledPayment {
  txHash: Hex;
  blockNumber: bigint;
  at: string | null; // ISO time, when the source knows it
  tNumber: bigint;
  payout: Address;
  amount: bigint; // token units
  invoiceRef: Hex;
  via?: "vault" | "router";
}

/** A PayeeRegistered the registry emitted: the T-number, the payout it bound, and the exact registered name. */
export interface RegisteredPayee {
  tNumber: bigint;
  payout: Address;
  legalName: string;
  at: string | null;
  txHash: Hex;
}

/** The payment token, as its contract reports it. */
export interface TokenInfo {
  symbol: string;
  decimals: number;
}

/** mJPYC an address has received in total. */
export interface ReceivedTotal {
  payout: Address;
  total: bigint;
}

/** An inclusive upper bound on the blocks read: RPC logs cover the history older than a MultiBaas index. */
export interface BlockRange {
  toBlock?: bigint;
}

/** Settlement history: MultiBaas's indexed events, or the same facts read from RPC logs. */
export interface PaymentHistory {
  source: "multibaas" | "rpc";
  fromBlock?: bigint; // RPC logs: nothing earlier is read
  invoicesPaid(limit: number, range?: BlockRange): Promise<SettledPayment[]>; // newest first
  received(payouts: Address[], range?: BlockRange): Promise<ReceivedTotal[]>;
  settlementOf(txHash: Hex): Promise<SettledPayment | null>; // the InvoicePaid in that transaction, once visible
}

/** MultiBaas's index of a chain, which starts at the block each contract was linked from. */
export interface IndexedHistory extends PaymentHistory {
  indexedFrom(contract: "vault" | "token"): Promise<bigint>;
}

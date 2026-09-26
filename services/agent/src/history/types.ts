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

/** Settlement history: MultiBaas's indexed events, or the same facts read from RPC logs. */
export interface PaymentHistory {
  source: "multibaas" | "rpc";
  invoicesPaid(limit: number): Promise<SettledPayment[]>; // newest first
  received(payouts: Address[]): Promise<ReceivedTotal[]>;
  settlementOf(txHash: Hex): Promise<SettledPayment | null>; // the InvoicePaid in that transaction, once visible
}

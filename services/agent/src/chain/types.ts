import type { Address, Hex } from "viem";

export type PayeeStatus = "none" | "active" | "disputed";

/** The registry's view of one T-number. */
export interface PayeeState {
  tNumber: bigint;
  status: PayeeStatus;
  legalName: string; // exact NTA-registered name ("" when unregistered)
  payout: Address; // registered payout; frozen while disputed
  pending: Address | null; // queued payout change still inside its timelock
  effectiveAt: number | null;
}

/** The vault's approval of one vendor. */
export interface VendorState {
  approved: boolean;
  payout: Address | null; // the registry payout pinned at approval time
  activeAt: number;
  periodStart: number;
  capPerPayment: bigint;
  capPerPeriod: bigint;
  spentInPeriod: bigint;
  remainingInPeriod: bigint;
}

/** Everything `payInvoice` checks, read at one block so the kernel sees a consistent picture. */
export interface Snapshot {
  blockNumber: bigint;
  timestamp: number;
  payee: PayeeState;
  vendor: VendorState;
  invoicePaid: bigint;
  vault: { paused: boolean; agent: Address; balance: bigint; mandate?: Mandate };
}

/**
 * The buyer company's ENS mandate for this agent (MandateGate), read when the vault's agent is the configured gate.
 * `holder` is the key the mandate authorises, or the zero address while the name doesn't answer.
 */
export interface Mandate {
  gate: Address;
  name: string; // e.g. ap.t4999900000005.payee.eth
  holder: Address;
}

export interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface VaultInfo {
  chainId: number;
  vault: Address;
  registry: Address;
  token: TokenInfo;
  agent: Address; // the key this service signs with
  vaultAgent: Address; // the agent the vault accepts: this key, or the MandateGate in front of it
  mandate: Mandate | null; // when the vault's agent is the configured gate
  owner: Address;
  paused: boolean;
  balance: bigint;
  vendorDelay: number;
  blockNumber: bigint;
  timestamp: number;
}

/** Read side of the chain, injected so tests can use fakes. */
export interface ChainPort {
  chainId: number;
  vault: Address;
  agent: Address;
  token(): Promise<TokenInfo>;
  snapshot(tNumber: bigint, invoiceRef: Hex): Promise<Snapshot>;
  payee(tNumber: bigint): Promise<PayeeState>;
  vendor(tNumber: bigint): Promise<{ payee: PayeeState; vendor: VendorState; timestamp: number }>;
  vaultInfo(): Promise<VaultInfo>;
}

/** The arguments of `AgentVault.payInvoice`. A zero `expectedPayout` means "whoever is registered". */
export interface PayCall {
  tNumber: bigint;
  expectedPayout: Address;
  amount: bigint;
  invoiceRef: Hex;
  /** A verified human's approval (World ID for Agents ID token), for the signer's own ceiling. Never logged. */
  approval?: { idToken: string };
}

/** A revert decoded against the Meigi ABIs: the custom error's name, its inputs and argument values. */
export interface RawRevert {
  name: string;
  inputs: readonly { name?: string | undefined; type: string }[];
  args: readonly unknown[];
}

export type Simulation = { ok: true; payout: Address } | { ok: false; revert: RawRevert };

export interface PaymentReceipt {
  txHash: Hex;
  status: "success" | "reverted";
  blockNumber: bigint;
}

export type SendOutcome =
  | { ok: true; receipt: PaymentReceipt } // mined (successfully or not)
  | { ok: false; revert: RawRevert } // the in-lock simulation reverted: nothing was sent
  | { ok: "pending"; txHash: Hex } // sent, but no receipt within the timeout
  | { ok: "refused"; message: string }; // the signer's own rule refused it (above its ceiling, no fresh approval)

/** Write side: the only code path that can move money, and it always simulates first. In production it is the signer. */
export interface PayerPort {
  simulate(call: PayCall): Promise<Simulation>;
  /** Simulates again inside a send lock, then broadcasts only if the simulation passed. `onSent` runs before waiting. */
  send(call: PayCall, onSent?: (txHash: Hex) => void): Promise<SendOutcome>;
  /** The receipt of an earlier send, or null while it is still pending. */
  receipt(txHash: Hex): Promise<PaymentReceipt | null>;
}

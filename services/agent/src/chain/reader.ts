import { agentVaultAbi, mandateGateAbi, payeeRegistryAbi } from "@meigi/abi";
import { erc20Abi, getAddress, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import type { ChainPort, Mandate, PayeeState, PayeeStatus, Snapshot, TokenInfo, VaultInfo, VendorState } from "./types.js";

const STATUS: PayeeStatus[] = ["none", "active", "disputed"];

/** The configured addresses don't match what the vault actually uses. Fatal: the kernel would check the wrong registry. */
export class ConfigMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigMismatchError";
  }
}

export interface ReaderOptions {
  client: PublicClient;
  chainId: number;
  vault: Address;
  agent: Address;
  registry: Address; // must equal vault.registry()
  token?: Address; // if set, must equal vault.token()
  gate?: Address; // MANDATE_GATE_ADDRESS: the vault's agent may be this MandateGate instead of the key
}

interface Contracts {
  registry: Address;
  token: TokenInfo;
  mandateName: string | null; // the gate's `<label>.t<principal>.payee.eth`, when a gate is configured
}

/** What every read needs: the client, the vault, and the vault's registry and token (read once). */
interface Reader {
  opts: ReaderOptions;
  contracts(): Promise<Contracts>;
}

export function createChainReader(opts: ReaderOptions): ChainPort & { init(): Promise<void> } {
  let setup: Promise<Contracts> | null = null;
  const reader: Reader = {
    opts,
    /** The vault's registry and token are immutable; a failed first read is retried on the next call. */
    contracts() {
      setup ??= loadContracts(opts).catch((error: unknown) => {
        setup = null;
        throw error;
      });
      return setup;
    },
  };
  return {
    chainId: opts.chainId,
    vault: opts.vault,
    agent: opts.agent,
    init: async () => void (await reader.contracts()),
    token: async () => (await reader.contracts()).token,
    snapshot: (tNumber, invoiceRef) => readSnapshot(reader, tNumber, invoiceRef),
    payee: async (tNumber) => readPayee(reader, tNumber, await opts.client.getBlockNumber()),
    vendor: (tNumber) => readVendorView(reader, tNumber),
    vaultInfo: () => readVaultInfo(reader),
  };
}

const vaultOf = (opts: ReaderOptions) => ({ address: opts.vault, abi: agentVaultAbi }) as const;

/** Everything payInvoice checks, all read at the latest block so the kernel sees one consistent state. */
async function readSnapshot(reader: Reader, tNumber: bigint, invoiceRef: Hex): Promise<Snapshot> {
  const { client } = reader.opts;
  const vault = vaultOf(reader.opts);
  const { token } = await reader.contracts();
  const block = await client.getBlock();
  const at = block.number;
  const [payee, vendor, invoicePaid, paused, agent, balance, mandate] = await Promise.all([
    readPayee(reader, tNumber, at),
    readVendor(reader, tNumber, at),
    client.readContract({ ...vault, functionName: "invoicePaidAmount", args: [tNumber, invoiceRef], blockNumber: at }),
    client.readContract({ ...vault, functionName: "paused", blockNumber: at }),
    client.readContract({ ...vault, functionName: "agent", blockNumber: at }),
    client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [reader.opts.vault], blockNumber: at }),
    readMandate(reader, at),
  ]);
  const gated = mandate && getAddress(agent) === getAddress(mandate.gate);
  return { blockNumber: at, timestamp: Number(block.timestamp), payee, vendor, invoicePaid, vault: { paused, agent, balance, ...(gated ? { mandate } : {}) } };
}

/** The configured gate's mandate at this block: who it authorises now (zero while the name doesn't answer). */
async function readMandate(reader: Reader, blockNumber?: bigint): Promise<Mandate | null> {
  const gate = reader.opts.gate;
  if (!gate) return null;
  const [{ mandateName }, holder] = await Promise.all([
    reader.contracts(),
    reader.opts.client.readContract({ address: gate, abi: mandateGateAbi, functionName: "holder", ...(blockNumber === undefined ? {} : { blockNumber }) }),
  ]);
  return { gate, name: mandateName ?? "the ENS mandate", holder };
}

async function readPayee(reader: Reader, tNumber: bigint, blockNumber: bigint): Promise<PayeeState> {
  const { registry } = await reader.contracts();
  const args = [tNumber] as const;
  const view = await reader.opts.client.readContract({ address: registry, abi: payeeRegistryAbi, functionName: "payeeOf", args, blockNumber });
  return toPayee(tNumber, view);
}

async function readVendor(reader: Reader, tNumber: bigint, blockNumber: bigint): Promise<VendorState> {
  const { client } = reader.opts;
  const vault = vaultOf(reader.opts);
  const [row, remaining] = await Promise.all([
    client.readContract({ ...vault, functionName: "vendors", args: [tNumber], blockNumber }),
    client.readContract({ ...vault, functionName: "remainingInPeriod", args: [tNumber], blockNumber }),
  ]);
  return toVendor(row, remaining);
}

async function readVendorView(reader: Reader, tNumber: bigint) {
  const block = await reader.opts.client.getBlock();
  const [payee, vendor] = await Promise.all([readPayee(reader, tNumber, block.number), readVendor(reader, tNumber, block.number)]);
  return { payee, vendor, timestamp: Number(block.timestamp) };
}

async function readVaultInfo(reader: Reader): Promise<VaultInfo> {
  const { client, chainId, agent } = reader.opts;
  const vault = vaultOf(reader.opts);
  const { registry, token } = await reader.contracts();
  const block = await client.getBlock();
  const blockNumber = block.number;
  const [vaultAgent, owner, paused, vendorDelay, balance, mandate] = await Promise.all([
    client.readContract({ ...vault, functionName: "agent", blockNumber }),
    client.readContract({ ...vault, functionName: "owner", blockNumber }),
    client.readContract({ ...vault, functionName: "paused", blockNumber }),
    client.readContract({ ...vault, functionName: "vendorDelay", blockNumber }),
    client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [reader.opts.vault], blockNumber }),
    readMandate(reader, blockNumber),
  ]);
  const timestamp = Number(block.timestamp);
  const gated = mandate && getAddress(vaultAgent) === getAddress(mandate.gate) ? mandate : null;
  return { chainId, vault: reader.opts.vault, registry, token, agent, vaultAgent, mandate: gated, owner, paused, balance, vendorDelay: Number(vendorDelay), blockNumber, timestamp };
}

async function loadContracts(opts: ReaderOptions): Promise<Contracts> {
  const vault = vaultOf(opts);
  const [registry, tokenAddress, agent, owner] = await Promise.all([
    opts.client.readContract({ ...vault, functionName: "registry" }),
    opts.client.readContract({ ...vault, functionName: "token" }),
    opts.client.readContract({ ...vault, functionName: "agent" }),
    opts.client.readContract({ ...vault, functionName: "owner" }),
  ]);
  checkRoles(opts.agent, agent, owner, opts.gate);
  if (getAddress(registry) !== getAddress(opts.registry)) {
    throw new ConfigMismatchError(`REGISTRY_ADDRESS is ${opts.registry}, but the vault uses ${registry}`);
  }
  if (opts.token && getAddress(tokenAddress) !== getAddress(opts.token)) {
    throw new ConfigMismatchError(`TOKEN_ADDRESS is ${opts.token}, but the vault pays in ${tokenAddress}`);
  }
  const token = { address: tokenAddress, abi: erc20Abi } as const;
  const [decimals, symbol, mandateName] = await Promise.all([
    opts.client.readContract({ ...token, functionName: "decimals" }),
    opts.client.readContract({ ...token, functionName: "symbol" }),
    opts.gate ? gateMandateName(opts.client, opts.gate, opts.vault) : Promise.resolve(null),
  ]);
  return { registry, token: { address: tokenAddress, symbol, decimals }, mandateName };
}

/** The gate's mandate name, once: its label and principal never change. The gate must forward to our vault. */
async function gateMandateName(client: PublicClient, gate: Address, vault: Address): Promise<string> {
  const g = { address: gate, abi: mandateGateAbi } as const;
  const [gateVault, label, principal] = await Promise.all([
    client.readContract({ ...g, functionName: "vault" }),
    client.readContract({ ...g, functionName: "label" }),
    client.readContract({ ...g, functionName: "principal" }),
  ]);
  if (getAddress(gateVault) !== getAddress(vault)) throw new ConfigMismatchError(`MANDATE_GATE_ADDRESS forwards to ${gateVault}, not VAULT_ADDRESS ${vault}`);
  return `${label}.t${principal.toString().padStart(13, "0")}.payee.eth`;
}

/**
 * The owner may pay an invoice twice (it can top up a payment), so the signer must never hold the owner key. The
 * vault's agent is this key, or the configured MandateGate; whether the mandate answers is checked per payment.
 */
function checkRoles(key: Address, agent: Address, owner: Address, gate?: Address): void {
  if (getAddress(key) === getAddress(owner)) {
    throw new ConfigMismatchError("AGENT_ADDRESS is the vault owner; the signer must hold the agent key (the owner bypasses duplicate-invoice checks)");
  }
  if (getAddress(key) !== getAddress(agent) && !(gate && getAddress(gate) === getAddress(agent))) {
    throw new ConfigMismatchError(`AGENT_ADDRESS is ${key}, but the vault's agent is ${agent}${gate ? ` (and not MANDATE_GATE_ADDRESS ${gate})` : ""}`);
  }
}

interface PayeeView {
  legalName: string;
  payout: Address;
  pending: Address;
  effectiveAt: bigint;
  status: number;
}

function toPayee(tNumber: bigint, v: PayeeView): PayeeState {
  const pending = v.pending === zeroAddress ? null : v.pending;
  return {
    tNumber,
    status: STATUS[v.status] ?? "none",
    legalName: v.legalName,
    payout: v.payout,
    pending,
    effectiveAt: pending ? Number(v.effectiveAt) : null,
  };
}

type VendorRow = readonly [Address, bigint, bigint, bigint, bigint, bigint];

function toVendor(row: VendorRow, remaining: bigint): VendorState {
  const [payout, activeAt, periodStart, capPerPayment, capPerPeriod, spentInPeriod] = row;
  const approved = payout !== zeroAddress;
  return {
    approved,
    payout: approved ? payout : null,
    activeAt: Number(activeAt),
    periodStart: Number(periodStart),
    capPerPayment,
    capPerPeriod,
    spentInPeriod,
    remainingInPeriod: remaining,
  };
}

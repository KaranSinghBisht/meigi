import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zeroAddress, type Address, type Hex } from "viem";
import { AnalysisStore } from "../src/analysis/store.js";
import { DEFAULT_HOLD_POLICY } from "../src/analysis/verdict.js";
import type { ChainPort, PayCall, PayerPort, PayeeState, RawRevert, SendOutcome, Snapshot, VendorState } from "../src/chain/types.js";
import type { AppDeps } from "../src/deps.js";
import { LlmError, type ExplanationFacts, type LlmPort, type Proposal } from "../src/llm/types.js";
import type { Screening, ScreeningPort } from "../src/screening/intercepta.js";
import type { TriageOk, TriagePort, TriageResult } from "../src/triage/triage.js";

export const DEMO_DIR = fileURLToPath(new URL("../scripts/demo-invoices/", import.meta.url));
export const demo = (file: string) => readFileSync(`${DEMO_DIR}${file}`, "utf8");

export const T_MEIGI = 2011001234567n;
export const T_BAYSIDE = 3999905000001n;
export const MEIGI_PAYOUT: Address = "0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4";
export const SCAMMER: Address = "0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b";
export const LOOKALIKE: Address = "0x9b4f84BB6eaC150c81C1CaED162cE0Eb872356e4";
export const AGENT: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
export const VAULT: Address = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
export const TOKEN: Address = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
export const NOW = 1_790_000_000;

export const yen = (n: number | bigint) => BigInt(n) * 10n ** 18n;

export function activePayee(tNumber = T_MEIGI, overrides: Partial<PayeeState> = {}): PayeeState {
  return { tNumber, status: "active", legalName: "株式会社メイギ商事", payout: MEIGI_PAYOUT, pending: null, effectiveAt: null, ...overrides };
}

export function approvedVendor(overrides: Partial<VendorState> = {}): VendorState {
  return {
    approved: true,
    payout: MEIGI_PAYOUT,
    activeAt: NOW - 7200,
    periodStart: NOW - 3600,
    capPerPayment: yen(500_000),
    capPerPeriod: yen(1_000_000),
    spentInPeriod: 0n,
    remainingInPeriod: yen(1_000_000),
    ...overrides,
  };
}

export const noVendor: VendorState = {
  approved: false,
  payout: null,
  activeAt: 0,
  periodStart: 0,
  capPerPayment: 0n,
  capPerPeriod: 0n,
  spentInPeriod: 0n,
  remainingInPeriod: 0n,
};

export function unregistered(tNumber: bigint): PayeeState {
  return { tNumber, status: "none", legalName: "", payout: zeroAddress, pending: null, effectiveAt: null };
}

/** An in-memory chain: payees, vendors and paid invoices keyed like the contracts. */
export class FakeChain implements ChainPort {
  chainId = 31337;
  vault = VAULT;
  agent = AGENT;
  payees = new Map<bigint, PayeeState>([[T_MEIGI, activePayee()]]);
  vendors = new Map<bigint, VendorState>([[T_MEIGI, approvedVendor()]]);
  paid = new Map<string, bigint>();
  vaultState = { paused: false, agent: AGENT, balance: yen(10_000_000) };
  down = false;

  async token() {
    this.check();
    return { address: TOKEN, symbol: "mJPYC", decimals: 18 };
  }
  async payee(tNumber: bigint) {
    return this.payees.get(tNumber) ?? unregistered(tNumber);
  }
  async snapshot(tNumber: bigint, invoiceRef: Hex): Promise<Snapshot> {
    this.check();
    return {
      blockNumber: 100n,
      timestamp: NOW,
      payee: await this.payee(tNumber),
      vendor: this.vendors.get(tNumber) ?? noVendor,
      invoicePaid: this.paid.get(`${tNumber}:${invoiceRef}`) ?? 0n,
      vault: { ...this.vaultState },
    };
  }
  async vendor(tNumber: bigint) {
    return { payee: await this.payee(tNumber), vendor: this.vendors.get(tNumber) ?? noVendor, timestamp: NOW };
  }
  async vaultInfo() {
    this.check();
    return {
      chainId: this.chainId,
      vault: VAULT,
      registry: "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address,
      token: await this.token(),
      agent: AGENT,
      vaultAgent: this.vaultState.agent,
      owner: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as Address,
      paused: this.vaultState.paused,
      balance: this.vaultState.balance,
      vendorDelay: 3600,
      blockNumber: 100n,
      timestamp: NOW,
    };
  }
  private check() {
    if (this.down) throw new Error("rpc down");
  }
}

/**
 * Records every call. `revert` makes simulations fail; `sendRevert` makes only the in-lock re-simulation fail;
 * `mode` "pending" leaves a sent transaction unmined (until `mine` is set), "reverted" mines it as reverted.
 */
export class FakePayer implements PayerPort {
  simulated: PayCall[] = [];
  sent: PayCall[] = [];
  revert: RawRevert | null = null;
  sendRevert: RawRevert | null = null;
  mode: "mined" | "pending" | "reverted" = "mined";
  mine: "success" | "reverted" | null = null;

  async simulate(call: PayCall) {
    this.simulated.push(call);
    return this.revert ? { ok: false as const, revert: this.revert } : { ok: true as const, payout: MEIGI_PAYOUT };
  }
  async send(call: PayCall, onSent?: (txHash: Hex) => void): Promise<SendOutcome> {
    if (this.sendRevert) return { ok: false, revert: this.sendRevert };
    this.sent.push(call);
    const txHash = `0xfeed${this.sent.length}` as Hex;
    onSent?.(txHash);
    if (this.mode === "pending") return { ok: "pending", txHash };
    return { ok: true, receipt: { txHash, status: this.mode === "reverted" ? "reverted" : "success", blockNumber: 101n } };
  }
  async receipt(txHash: Hex) {
    return this.mine ? { txHash, status: this.mine, blockNumber: 102n } : null;
  }
}

export function routineTriage(overrides: Partial<TriageOk> = {}): TriageOk {
  return {
    status: "ok",
    backend: "fake",
    model: "kev-latest",
    latencyMs: 12,
    requestType: { value: "routine_invoice", confidence: 0.95, probabilities: null },
    newDestination: 0.03,
    pressure: 0.02,
    suspicion: { score: 0.2, level: "Clearly benign: routine business, nothing unusual", probabilities: null },
    pSafe: 0.95,
    minPSafe: 0.9,
    route: "auto_clear",
    holdReasons: [],
    attempts: [],
    ...overrides,
  };
}

export class FakeTriage implements TriagePort {
  backends = ["fake"];
  constructor(public result: TriageResult = routineTriage()) {}
  async triage() {
    return this.result;
  }
}

export class FakeLlm implements LlmPort {
  provider = "anthropic" as const;
  model = "fake-haiku";
  explained: ExplanationFacts[] = [];
  constructor(public proposal: Proposal | LlmError) {}
  async propose() {
    if (this.proposal instanceof LlmError) throw this.proposal;
    return this.proposal;
  }
  async explain(facts: ExplanationFacts) {
    this.explained.push(facts);
    return `LLM explanation (${facts.decision})`;
  }
}

export class FakeScreening implements ScreeningPort {
  enabled = false;
  constructor(public result: Screening = { status: "not_configured", message: "screening not configured", reason: "no INTERCEPTA_API_KEY is configured" }) {}
  async screen() {
    return this.result;
  }
}

export interface Fakes {
  chain: FakeChain;
  payer: FakePayer;
  triage: FakeTriage;
  screening: FakeScreening;
}

export function fakeDeps(parts: Partial<Fakes> = {}, llm: LlmPort | null = null): AppDeps & Fakes {
  const fakes: Fakes = {
    chain: parts.chain ?? new FakeChain(),
    payer: parts.payer ?? new FakePayer(),
    triage: parts.triage ?? new FakeTriage(),
    screening: parts.screening ?? new FakeScreening(),
  };
  return {
    ...fakes,
    llm,
    store: new AnalysisStore(),
    vendorTNumbers: ["2011001234567", "3999905000001"],
    origins: ["http://localhost:5173"],
    triageRequired: true,
    holds: DEFAULT_HOLD_POLICY,
    approvals: null,
    apiToken: null,
    demoDir: DEMO_DIR,
    info: { chainId: 31337, vault: VAULT, agent: AGENT, triage: ["fake"], triageRequired: true, llm: llm ? "fake" : "none", screening: false, humanApproval: false },
  };
}

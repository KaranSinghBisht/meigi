import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { decide, DEFAULT_HOLD_POLICY } from "../src/analysis/verdict.js";
import type { Snapshot } from "../src/chain/types.js";
import { extractInvoice } from "../src/extract/extract.js";
import { buildIntent, invoiceRefOf } from "../src/kernel/intent.js";
import { evaluate, type KernelResult } from "../src/kernel/kernel.js";
import type { Proposal } from "../src/llm/types.js";
import type { Screening } from "../src/screening/intercepta.js";
import {
  activePayee,
  AGENT,
  approvedVendor,
  demo,
  LOOKALIKE,
  MEIGI_PAYOUT,
  noVendor,
  NOW,
  routineTriage,
  SCAMMER,
  T_MEIGI,
  TOKEN,
  unregistered,
  yen,
} from "./fakes.js";

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    blockNumber: 100n,
    timestamp: NOW,
    payee: activePayee(),
    vendor: approvedVendor(),
    invoicePaid: 0n,
    vault: { paused: false, agent: AGENT, balance: yen(10_000_000) },
    ...overrides,
  };
}

/** Extracts the document, builds the intent (optionally with an LLM proposal) and runs the kernel. */
function kernelFor(text: string, snap: Snapshot = snapshot(), proposal: Proposal | null = null, chain = { chainId: 11155111, token: TOKEN }): KernelResult {
  const extracted = extractInvoice(text);
  const { intent, reasons } = buildIntent(extracted, proposal, 18);
  if (!intent) throw new Error("no intent");
  const document = { claimedName: extracted.claimedName, x402: extracted.x402 };
  return evaluate(intent, reasons, snap, { decimals: 18, agent: AGENT, documentAddresses: extracted.addresses, document, chain });
}

const codes = (k: KernelResult) => k.reasons.map((r) => r.code);
const routine = demo("01-routine-invoice.ja.txt");
const bec = demo("02-bank-change-bec.ja.txt");

describe("kernel verdicts", () => {
  it("passes a routine invoice to the registered payout", () => {
    const k = kernelFor(routine);
    expect(k.ok).toBe(true);
    expect(k.reasons).toEqual([]);
    expect(k.checks.map((c) => c.code)).toEqual(
      expect.arrayContaining(["vendor_approved", "payee_registered", "payout_matches", "within_payment_cap", "not_paid_before", "vault_funded"]),
    );
    expect(k.intent).toMatchObject({
      tNumber: "T2011001234567",
      expectedPayout: MEIGI_PAYOUT,
      amount: { value: "132000", units: yen(132_000).toString() },
      invoiceRef: invoiceRefOf("2011001234567", "MS-2026-0917"),
    });
  });

  it("names the real company when the invoice asks for another address", () => {
    const k = kernelFor(bec);
    const mismatch = k.reasons.find((r) => r.code === "payout_mismatch");
    expect(mismatch).toMatchObject({ severity: "block", revert: "PayeeMismatch", legalName: "株式会社メイギ商事", tNumber: "T2011001234567" });
    expect(mismatch?.message).toBe("T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b.");
    expect(k.ok).toBe(false);
  });

  it("announces a queued payout change but never shows its address before it lands", () => {
    const payee = activePayee(T_MEIGI, { pending: SCAMMER, effectiveAt: NOW + 72 * 3600 });
    const k = kernelFor(routine, snapshot({ payee }));
    expect(codes(k)).toContain("payout_change_pending");
    expect(k.payee).toMatchObject({ changePending: true, pendingEffectiveAt: NOW + 72 * 3600 });
    expect(JSON.stringify(k).toLowerCase()).not.toContain(SCAMMER.toLowerCase());
  });

  it("holds unregistered, disputed and unapproved payees", () => {
    const none = kernelFor(routine, snapshot({ payee: unregistered(T_MEIGI), vendor: noVendor }));
    expect(codes(none)).toEqual(["vendor_not_approved", "payee_not_registered"]);
    const disputed = kernelFor(routine, snapshot({ payee: activePayee(T_MEIGI, { status: "disputed" }) }));
    expect(disputed.reasons.find((r) => r.code === "payee_disputed")?.revert).toBe("PayeeNotActive");
    const unapproved = kernelFor(routine, snapshot({ vendor: noVendor }));
    expect(codes(unapproved)).toEqual(["vendor_not_approved"]); // no cap noise for a vendor with no caps
  });

  it("holds a vendor that is not active yet or whose payout changed since approval", () => {
    // Before activeAt the contract's remainingInPeriod reads 0: only the real reason is reported.
    const early = kernelFor(routine, snapshot({ vendor: approvedVendor({ activeAt: NOW + 600, remainingInPeriod: 0n }) }));
    expect(early.reasons.map((r) => r.revert)).toEqual(["VendorNotYetActive"]);
    const repinned = kernelFor(routine, snapshot({ vendor: approvedVendor({ payout: SCAMMER }) }));
    expect(repinned.reasons.map((r) => r.revert)).toContain("VendorPayoutChanged");
  });

  it("enforces the per-payment and per-period caps", () => {
    const capped = kernelFor(routine, snapshot({ vendor: approvedVendor({ capPerPayment: yen(100_000) }) }));
    expect(capped.reasons.find((r) => r.code === "over_payment_cap")?.message).toBe(
      "¥132,000 is over T2011001234567 = 株式会社メイギ商事's ¥100,000 per-payment cap.",
    );
    const spent = kernelFor(routine, snapshot({ vendor: approvedVendor({ remainingInPeriod: yen(50_000) }) }));
    expect(spent.reasons.map((r) => r.revert)).toEqual(["OverPeriodCap"]);
  });

  it("refuses to pay an invoice twice, from an empty vault, a paused vault or a foreign agent key", () => {
    expect(codes(kernelFor(routine, snapshot({ invoicePaid: yen(132_000) })))).toEqual(["invoice_already_paid"]);
    const vault = { paused: false, agent: AGENT, balance: yen(1_000) };
    expect(codes(kernelFor(routine, snapshot({ vault })))).toEqual(["insufficient_balance"]);
    expect(codes(kernelFor(routine, snapshot({ vault: { ...vault, balance: yen(10_000_000), paused: true } })))).toEqual(["vault_paused"]);
    const foreign = { ...vault, balance: yen(10_000_000), agent: SCAMMER };
    expect(kernelFor(routine, snapshot({ vault: foreign })).reasons.map((r) => r.revert)).toEqual(["NotAgent"]);
  });

  it("pays by T-number alone when the invoice prints no address", () => {
    const k = kernelFor("登録番号: T2011001234567\n請求書番号: MS-77\nご請求金額 ¥10,000");
    expect(k.ok).toBe(true);
    expect(k.intent?.expectedPayout).toBe(zeroAddress);
    expect(k.checks.find((c) => c.code === "pay_by_t_number")?.message).toContain(MEIGI_PAYOUT);
  });

  it("never pays a credit note", () => {
    const k = kernelFor(demo("05-credit-note.ja.txt"));
    expect(k.reasons.find((r) => r.code === "not_payable")?.message).toContain("-¥22,000");
  });
});

describe("the gullible agent's proposal", () => {
  const injected = demo("04-prompt-injection.ja.txt");
  const fooled: Proposal = {
    tNumber: "T2011001234567",
    payTo: LOOKALIKE,
    amount: "88000",
    invoiceNumber: "MS-2026-1010",
    wouldPay: true,
    reasoning: "The invoice says the wallet moved.",
  };

  it("is checked like any other intent: the lookalike is refused with the real name", () => {
    const k = kernelFor(injected, snapshot(), fooled);
    expect(k.intent).toMatchObject({ source: "llm", payTo: LOOKALIKE });
    const mismatch = k.reasons.filter((r) => r.code === "payout_mismatch");
    expect(mismatch).toHaveLength(1);
    expect(mismatch[0]?.message).toBe("T2011001234567 = 株式会社メイギ商事 pays 0x9B4f…47e4; this invoice asked for 0x9b4f…56e4.");
  });

  it("is blocked when it invents an address, a T-number or an amount the document never printed", () => {
    const invented: Proposal = { ...fooled, tNumber: "T3999905000001", payTo: SCAMMER, amount: "880000" };
    const extracted = extractInvoice(routine);
    const { intent, reasons } = buildIntent(extracted, invented, 18);
    expect(reasons.map((r) => r.code)).toEqual([
      "proposal_t_number_differs",
      "proposal_address_not_in_document",
      "proposal_amount_differs",
    ]);
    // The model never picks the vendor or the amount: those are the printed ones.
    expect(intent).toMatchObject({ tNumber: "2011001234567", amountValue: "132000", payTo: SCAMMER });
  });

  it("falls back to the extraction for fields the model left out", () => {
    const partial: Proposal = { tNumber: null, payTo: null, amount: null, invoiceNumber: null, wouldPay: true, reasoning: "" };
    const { intent } = buildIntent(extractInvoice(routine), partial, 18);
    expect(intent).toMatchObject({ tNumber: "2011001234567", payTo: MEIGI_PAYOUT, amountValue: "132000" });
  });
});

describe("verdict", () => {
  const clean: Screening = { status: "ok", results: [], errors: [], callsUsed: 1, callBudget: 900 };
  const verdictFor = (text: string, extra: Partial<Parameters<typeof decide>[0]> = {}) =>
    decide({ extracted: extractInvoice(text), kernel: kernelFor(text), triage: routineTriage(), screening: clean, triageRequired: true, holds: DEFAULT_HOLD_POLICY, ...extra });

  it("pays only when every layer agrees", () => {
    expect(verdictFor(routine).decision).toBe("pay");
  });

  it("holds on triage, and every reason carries the registered legal name", () => {
    const triage = routineTriage({ route: "hold", holdReasons: ["classified as payee_change (confidence 91%)"] });
    const v = verdictFor(routine, { triage });
    expect(v.decision).toBe("hold");
    expect(v.reasons).toEqual([expect.objectContaining({ code: "triage_hold", legalName: "株式会社メイギ商事", tNumber: "T2011001234567" })]);
  });

  it("holds when triage is unavailable, unless triage is optional", () => {
    const triage = { status: "unavailable" as const, message: "triage unavailable" as const, attempts: [{ backend: "systemone", code: "unreachable", error: "could not connect" }] };
    expect(verdictFor(routine, { triage }).reasons[0]?.message).toContain("systemone: could not connect");
    const optional = verdictFor(routine, { triage, triageRequired: false });
    expect(optional.decision).toBe("pay");
    expect(optional.warnings.map((w) => w.code)).toContain("triage_unavailable");
  });

  it("holds when Intercepta flags an address, only warns without a key, and holds (approvably) when a configured screen fails", () => {
    const flagged: Screening = {
      ...clean,
      results: [{ address: MEIGI_PAYOUT, toxicScore: 87, traits: [], checkedAt: "", flagged: true, cached: false }],
    };
    expect(verdictFor(routine, { screening: flagged }).reasons.map((r) => r.code)).toEqual(["screening_flagged"]);
    const off: Screening = { status: "not_configured", message: "screening not configured", reason: "no INTERCEPTA_API_KEY is configured" };
    const v = verdictFor(routine, { screening: off });
    expect(v.decision).toBe("pay");
    expect(v.warnings.map((w) => w.code)).toContain("screening_not_configured");
    const down: Screening = { status: "unavailable", message: "screening unavailable", reason: "Intercepta answered 503" };
    expect(verdictFor(routine, { screening: down }).reasons).toEqual([expect.objectContaining({ code: "screening_unavailable", severity: "block" })]);
    const partial: Screening = { ...clean, errors: [{ address: MEIGI_PAYOUT, error: "Intercepta did not answer in time" }] };
    expect(verdictFor(routine, { screening: partial }).reasons.map((r) => r.code)).toEqual(["screening_unavailable"]);
  });

  it("holds a tampered document even when the chain would accept it", () => {
    const v = verdictFor(demo("04-prompt-injection.ja.txt"));
    expect(v.decision).toBe("hold");
    expect(v.reasons.map((r) => r.code)).toEqual(["html_markup", "hidden_payment_details", "prompt_injection_suspected"]);
  });
});

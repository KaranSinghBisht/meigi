import type { BeforePaymentCreationHook, ClientExtension, PaymentCreationContext } from "@x402/core/client";
import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  checkPayee,
  meigiPayeeDeclaration,
  meigiPayeeExtension,
  registerMeigiGuard,
  requireMeigiPayee,
  type GuardClient,
  type GuardDeps,
  type GuardVerdict,
} from "../src/index.js";

const REGISTERED: Address = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const SWAPPED: Address = "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef";
const NETWORK = "eip155:11155111";

function deps(overrides: Partial<GuardDeps> = {}): GuardDeps {
  return {
    network: NETWORK,
    payee: async (t) =>
      t === 1010601051968n
        ? { status: 1, legalName: "Ｃｕｒｖｅｇｒｉｄ株式会社", payout: REGISTERED }
        : { status: 0, legalName: "", payout: "0x0000000000000000000000000000000000000000" },
    ...overrides,
  };
}

const declared = meigiPayeeDeclaration("T1010601051968")["meigi-payee"];

describe("checkPayee", () => {
  it("allows the registered payout", async () => {
    const verdict = await checkPayee(deps(), declared, { payTo: REGISTERED.toLowerCase(), network: NETWORK });
    expect(verdict).toMatchObject({ ok: true, tNumber: "T1010601051968" });
  });

  it("refuses a swapped payTo and names the real company", async () => {
    const verdict = await checkPayee(deps(), declared, { payTo: SWAPPED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: false, code: "payto_mismatch" });
    expect((verdict as { reason: string }).reason).toContain("Ｃｕｒｖｅｇｒｉｄ株式会社 (T1010601051968)");
  });

  it("refuses unregistered or disputed payees, other networks and malformed declarations", async () => {
    const unknown = meigiPayeeDeclaration("T2011001234567")["meigi-payee"];
    expect(await checkPayee(deps(), unknown, { payTo: REGISTERED, network: NETWORK })).toMatchObject({ code: "payee_not_active" });
    expect(await checkPayee(deps(), declared, { payTo: REGISTERED, network: "eip155:8453" })).toMatchObject({ code: "network_mismatch" });
    expect(await checkPayee(deps(), { tNumber: "nope" }, { payTo: REGISTERED, network: NETWORK })).toMatchObject({ code: "invalid_declaration" });
  });

  it("applies optional screening to the registered payout too", async () => {
    const screen = async () => ({ flagged: true, summary: "toxicScore 91: known_scammer" });
    const verdict = await checkPayee(deps({ screen }), declared, { payTo: REGISTERED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: false, code: "screened" });
  });

  it("reports the screening of a swapped payTo alongside the registry mismatch", async () => {
    const screen = async (a: Address) => ({ flagged: a === SWAPPED.toLowerCase() || a.toLowerCase() === SWAPPED, summary: "toxicScore 95: known_scammer" });
    const verdict = await checkPayee(deps({ screen }), declared, { payTo: SWAPPED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: false, code: "payto_mismatch", screening: { flagged: true } });
  });
});

function context(payTo: string, extensions?: Record<string, unknown>): PaymentCreationContext {
  const selectedRequirements = { scheme: "exact", network: NETWORK, asset: "0x00", amount: "1000", payTo, maxTimeoutSeconds: 60, extra: {} };
  return {
    paymentRequired: { x402Version: 2, resource: { url: "https://merchant.example/data" }, accepts: [selectedRequirements], extensions },
    selectedRequirements,
  } as PaymentCreationContext;
}

describe("x402 hooks", () => {
  it("abort the payment before signing when payTo was swapped", async () => {
    const seen: GuardVerdict[] = [];
    const hook = meigiPayeeExtension(deps(), { onVerdict: (v) => seen.push(v) }).hooks!.onBeforePaymentCreation!;
    const result = await hook(declared, context(SWAPPED, meigiPayeeDeclaration("T1010601051968")));
    expect(result).toMatchObject({ abort: true });
    expect(seen[0]).toMatchObject({ code: "payto_mismatch" });
    expect(await hook(declared, context(REGISTERED, meigiPayeeDeclaration("T1010601051968")))).toBeUndefined();
  });

  it("strict mode refuses merchants that declare nothing", async () => {
    const hook = requireMeigiPayee();
    expect(await hook(context(REGISTERED))).toMatchObject({ abort: true });
    expect(await hook(context(REGISTERED, meigiPayeeDeclaration("T1010601051968")))).toBeUndefined();
  });
});

/** A minimal fake x402Client: records what registerMeigiGuard registers, without needing the real SDK. */
function fakeClient() {
  const extensions: ClientExtension[] = [];
  const beforeHooks: BeforePaymentCreationHook[] = [];
  const client: GuardClient = {
    registerExtension(extension) {
      extensions.push(extension);
      return client;
    },
    onBeforePaymentCreation(hook) {
      beforeHooks.push(hook);
      return client;
    },
  };
  return { client, extensions, beforeHooks };
}

describe("registerMeigiGuard", () => {
  it("always registers the declared-merchant extension, and returns the same client for chaining", () => {
    const { client, extensions } = fakeClient();
    expect(registerMeigiGuard(client, deps(), { undeclared: "refuse" })).toBe(client);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]!.key).toBe("meigi-payee");
  });

  it('undeclared: "refuse" also registers requireMeigiPayee, which refuses an undeclared merchant', async () => {
    const { client, beforeHooks } = fakeClient();
    registerMeigiGuard(client, deps(), { undeclared: "refuse" });
    expect(beforeHooks).toHaveLength(1);
    expect(await beforeHooks[0]!(context(REGISTERED))).toMatchObject({ abort: true });
  });

  it("undeclared: UnverifiedPolicy registers screenUndeclaredPayee, capping an undeclared merchant instead of refusing it", async () => {
    const { client, beforeHooks } = fakeClient();
    registerMeigiGuard(client, deps(), { undeclared: { maxAmount: 10n ** 18n } });
    expect(beforeHooks).toHaveLength(1);
    const over = { ...context(REGISTERED), selectedRequirements: { ...context(REGISTERED).selectedRequirements, amount: (10n ** 19n).toString() } };
    expect(await beforeHooks[0]!(over)).toMatchObject({ abort: true });
  });

  it("without an undeclared policy, registers only the extension and warns loudly instead of leaving a silent gap", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { client, extensions, beforeHooks } = fakeClient();
      registerMeigiGuard(client, deps());
      expect(extensions).toHaveLength(1); // the declared-merchant half is still registered...
      expect(beforeHooks).toHaveLength(0); // ...but nothing catches an undeclared merchant...
      expect(warn).toHaveBeenCalledTimes(1); // ...and that gap is never silent.
      expect(warn.mock.calls[0]![0]).toContain("no Meigi payee at all will be paid with NO check");
    } finally {
      warn.mockRestore();
    }
  });
});

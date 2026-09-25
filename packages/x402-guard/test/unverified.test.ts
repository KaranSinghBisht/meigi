import type { PaymentCreationContext } from "@x402/core/client";
import { getAddress, type Address } from "viem";
import { describe, expect, it, vi } from "vitest";
import { checkUndeclared, meigiPayeeDeclaration, screenUndeclaredPayee, type GuardVerdict } from "../src/index.js";

const PAY_TO: Address = "0xc0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0";
const NETWORK = "eip155:11155111";
const clean = async () => ({ flagged: false, summary: "toxicScore 0" });
const flagged = async () => ({ flagged: true, summary: "toxicScore 96: known_scammer" });

function context(amount: string, extensions?: Record<string, unknown>): PaymentCreationContext {
  const selectedRequirements = { scheme: "exact", network: NETWORK, asset: "0x00", amount, payTo: PAY_TO, maxTimeoutSeconds: 60, extra: {} };
  return {
    paymentRequired: { x402Version: 2, resource: { url: "https://merchant.example/data" }, accepts: [selectedRequirements], extensions },
    selectedRequirements,
  } as PaymentCreationContext;
}

describe("checkUndeclared", () => {
  it("pays a small amount once screening clears payTo", async () => {
    const verdict = await checkUndeclared({ screen: clean, maxAmount: 50n }, { payTo: PAY_TO, amount: "10" });
    expect(verdict).toMatchObject({ ok: true, unverified: true, payTo: getAddress(PAY_TO), screening: { flagged: false } });
  });

  it("refuses a flagged payTo and says why", async () => {
    const verdict = await checkUndeclared({ screen: flagged, maxAmount: 50n }, { payTo: PAY_TO, amount: "10" });
    expect(verdict).toMatchObject({ ok: false, code: "screened", screening: { flagged: true } });
    expect((verdict as { reason: string }).reason).toContain("known_scammer");
  });

  it("refuses above the unverified limit without spending a screening call", async () => {
    const screen = vi.fn(clean);
    expect(await checkUndeclared({ screen, maxAmount: 50n }, { payTo: PAY_TO, amount: "51" })).toMatchObject({ code: "unverified_over_limit" });
    expect(await checkUndeclared({ screen, maxAmount: 50n }, { payTo: PAY_TO, amount: "1e3" })).toMatchObject({ code: "unverified_over_limit" });
    expect(screen).not.toHaveBeenCalled();
  });

  it("fails closed without a screener or when screening fails", async () => {
    expect(await checkUndeclared({ maxAmount: 50n }, { payTo: PAY_TO, amount: "10" })).toMatchObject({ code: "no_declaration" });
    const down = async () => {
      throw new Error("intercepta quick-scan failed with HTTP 503");
    };
    const verdict = await checkUndeclared({ screen: down, maxAmount: 50n }, { payTo: PAY_TO, amount: "10" });
    expect(verdict).toMatchObject({ ok: false, code: "screening_unavailable" });
    expect((verdict as { reason: string }).reason).toContain("HTTP 503");
  });

  it("refuses a payTo that isn't an address", async () => {
    expect(await checkUndeclared({ screen: clean, maxAmount: 50n }, { payTo: "nope", amount: "10" })).toMatchObject({ code: "payto_mismatch" });
  });
});

describe("screenUndeclaredPayee hook", () => {
  it("leaves declared merchants to the registry check", async () => {
    const screen = vi.fn(flagged);
    const hook = screenUndeclaredPayee({ screen, maxAmount: 50n });
    expect(await hook(context("10", meigiPayeeDeclaration("T8999900000001")))).toBeUndefined();
    expect(screen).not.toHaveBeenCalled();
  });

  it("aborts before signing when screening flags an undeclared merchant", async () => {
    const seen: GuardVerdict[] = [];
    const hook = screenUndeclaredPayee({ screen: flagged, maxAmount: 50n }, { onVerdict: (v) => seen.push(v) });
    expect(await hook(context("10"))).toMatchObject({ abort: true });
    expect(seen[0]).toMatchObject({ code: "screened" });
    expect(await screenUndeclaredPayee({ screen: clean, maxAmount: 50n })(context("10"))).toBeUndefined();
  });
});

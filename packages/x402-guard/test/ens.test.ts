import type { Address } from "viem";
import { describe, expect, it, vi } from "vitest";
import { checkPayee, meigiPayeeDeclaration, type GuardDeps } from "../src/index.js";

const REGISTERED: Address = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const SWAPPED: Address = "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef";
const NETWORK = "eip155:11155111";
const T_NUMBER = "T1010601051968";
const EXPECTED_ENS = "t1010601051968.payee.eth";

function deps(resolveEns?: GuardDeps["resolveEns"]): GuardDeps {
  return {
    network: NETWORK,
    payee: async () => ({ status: 1, legalName: "Ｃｕｒｖｅｇｒｉｄ株式会社", payout: REGISTERED }),
    resolveEns,
  };
}

describe("checkPayee: ens (independent of the registry check)", () => {
  it("passes when the declared ens resolves to the registered payout", async () => {
    const resolveEns = vi.fn(async () => REGISTERED);
    const declared = meigiPayeeDeclaration(T_NUMBER)["meigi-payee"];
    const verdict = await checkPayee(deps(resolveEns), declared, { payTo: REGISTERED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: true, tNumber: T_NUMBER });
    expect(resolveEns).toHaveBeenCalledWith(EXPECTED_ENS);
  });

  it("refuses when the declared ens resolves to a different address", async () => {
    const resolveEns = async () => SWAPPED;
    const declared = meigiPayeeDeclaration(T_NUMBER)["meigi-payee"];
    const verdict = await checkPayee(deps(resolveEns), declared, { payTo: REGISTERED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: false, code: "ens_mismatch" });
    expect((verdict as { reason: string }).reason).toContain(EXPECTED_ENS);
  });

  it("fails closed when the declared ens doesn't resolve at all", async () => {
    const resolveEns = async () => null;
    const declared = meigiPayeeDeclaration(T_NUMBER)["meigi-payee"];
    const verdict = await checkPayee(deps(resolveEns), declared, { payTo: REGISTERED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: false, code: "ens_unresolved" });
    expect((verdict as { reason: string }).reason).toContain(EXPECTED_ENS);
  });

  it("refuses a declared ens for the wrong label without ever resolving it", async () => {
    const resolveEns = vi.fn(async () => REGISTERED);
    const declared = { tNumber: T_NUMBER, ens: "t2011001234567.payee.eth" };
    const verdict = await checkPayee(deps(resolveEns), declared, { payTo: REGISTERED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: false, code: "ens_mismatch" });
    expect((verdict as { reason: string }).reason).toContain("t2011001234567.payee.eth");
    expect(resolveEns).not.toHaveBeenCalled();
  });

  it("names the ens name when payTo is swapped but the company's ens still resolves correctly", async () => {
    // Models a compromised merchant server: it can edit payTo, but not the company's ENS name or registry
    // entry, so ens resolves to the truth (REGISTERED) even though payTo itself now asks for SWAPPED.
    const resolveEns = async () => REGISTERED;
    const declared = meigiPayeeDeclaration(T_NUMBER)["meigi-payee"];
    const verdict = await checkPayee(deps(resolveEns), declared, { payTo: SWAPPED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: false, code: "ens_mismatch" });
    expect((verdict as { reason: string }).reason).toContain(EXPECTED_ENS);
  });

  it("skips the ens check entirely when the declaration has no ens field", async () => {
    const resolveEns = vi.fn(async () => SWAPPED); // would fail the check if it ran at all
    const declared = { tNumber: T_NUMBER };
    const verdict = await checkPayee(deps(resolveEns), declared, { payTo: REGISTERED, network: NETWORK });
    expect(verdict).toMatchObject({ ok: true, tNumber: T_NUMBER });
    expect(resolveEns).not.toHaveBeenCalled();
  });
});

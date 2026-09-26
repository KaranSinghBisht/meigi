import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { routeOf, RouteError, type RouteFacts } from "../src/route.js";

const KEY = "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68" as Address;
const VAULT = "0x87A798CD92dE1340B1b761dd45196AC82bEF793B" as Address;
const OWNER = "0x936b000000000000000000000000000000000001" as Address;
const GATE = "0x6a7e000000000000000000000000000000000002" as Address;
const OTHER = "0x0000000000000000000000000000000000000bad" as Address;

const facts = (over: Partial<RouteFacts> = {}): RouteFacts => ({ key: KEY, vault: VAULT, owner: OWNER, vaultAgent: KEY, gate: null, ...over });

describe("where the signer sends payInvoice", () => {
  it("pays the vault directly while its agent is this key, with or without a gate configured (the rollback path)", () => {
    expect(routeOf(facts())).toEqual({ target: VAULT, via: "vault", gate: null, warning: null });
    expect(routeOf(facts({ gate: GATE }))).toMatchObject({ target: VAULT, via: "vault" });
  });

  it("pays through the gate once the vault's agent is the gate and the mandate names this key", () => {
    expect(routeOf(facts({ vaultAgent: GATE, gate: GATE, gateVault: VAULT, holder: KEY }))).toEqual({ target: GATE, via: "gate", gate: GATE, warning: null });
  });

  it("starts, with a warning, while the mandate doesn't answer, so payments come back as MandateNotLive", () => {
    const route = routeOf(facts({ vaultAgent: GATE, gate: GATE, gateVault: VAULT, holder: zeroAddress }));
    expect(route).toMatchObject({ target: GATE, via: "gate" });
    expect(route.warning).toContain("MandateNotLive");
  });

  it("refuses the owner's key, an agent it doesn't know, a gate for another vault, and a mandate for another key", () => {
    expect(() => routeOf(facts({ key: OWNER }))).toThrow(RouteError);
    expect(() => routeOf(facts({ vaultAgent: OTHER }))).toThrow(/the vault's agent is/u);
    expect(() => routeOf(facts({ vaultAgent: GATE }))).toThrow(/the vault's agent is/u); // a gate nobody configured
    expect(() => routeOf(facts({ vaultAgent: GATE, gate: GATE, gateVault: OTHER, holder: KEY }))).toThrow(/forwards to/u);
    expect(() => routeOf(facts({ vaultAgent: GATE, gate: GATE, gateVault: VAULT, holder: OTHER }))).toThrow(/authorises/u);
  });
});

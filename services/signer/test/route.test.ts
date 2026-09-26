import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config.js";
import { routeOf, RouteError, type RouteFacts } from "../src/route.js";

const KEY = "0xa73b6418AadCd5C548eEfF828C31081cAe7FBA68" as Address;
const VAULT = "0x87A798CD92dE1340B1b761dd45196AC82bEF793B" as Address;
const OWNER = "0x936b000000000000000000000000000000000001" as Address;
const GATE = "0x6a7e000000000000000000000000000000000002" as Address;
const OTHER = "0x0000000000000000000000000000000000000bad" as Address;

const direct = (over: Partial<RouteFacts> = {}): RouteFacts => ({ key: KEY, vault: VAULT, owner: OWNER, vaultAgent: KEY, viaGate: false, gate: null, ...over });
const MANDATE = { principal: 4999900000005n, label: "ap" };
const gated = (over: Partial<RouteFacts> = {}): RouteFacts =>
  direct({ viaGate: true, gate: GATE, mandate: MANDATE, vaultAgent: GATE, gateVault: VAULT, gatePrincipal: 4999900000005n, gateLabel: "ap", holder: KEY, ...over });

describe("where the signer sends payInvoice", () => {
  it("pays the vault directly by default, while its agent is this key", () => {
    expect(routeOf(direct())).toEqual({ target: VAULT, via: "vault", gate: null });
    expect(routeOf(direct({ gate: GATE }))).toEqual({ target: VAULT, via: "vault", gate: null }); // a gate configured but off
  });

  it("pays through the gate with SIGNER_VIA_GATE=1, once the gate is the vault's agent and the mandate names this key", () => {
    expect(routeOf(gated())).toEqual({ target: GATE, via: "gate", gate: GATE });
  });

  it("refuses to start whenever the chain doesn't match the setting, strictly", () => {
    expect(() => routeOf(direct({ key: OWNER }))).toThrow(RouteError);
    expect(() => routeOf(direct({ vaultAgent: GATE, gate: GATE }))).toThrow(/set SIGNER_VIA_GATE=1/u); // wired, flag off
    expect(() => routeOf(direct({ vaultAgent: OTHER }))).toThrow(/the vault's agent is/u);
    expect(() => routeOf(gated({ vaultAgent: KEY }))).toThrow(/not the MandateGate/u); // flag on, rolled back on-chain
    expect(() => routeOf(gated({ gateVault: OTHER }))).toThrow(/forwards to/u);
    expect(() => routeOf(gated({ holder: zeroAddress }))).toThrow(/doesn't answer/u); // a dark mandate: no start
    expect(() => routeOf(gated({ holder: OTHER }))).toThrow(/authorises/u);
    expect(() => routeOf(gated({ gate: null }))).toThrow(/needs MANDATE_GATE_ADDRESS/u);
  });

  it("refuses a gate that enforces another company's mandate, even one that names this key", () => {
    expect(() => routeOf(gated({ gatePrincipal: 6999900000003n }))).toThrow(/enforces the mandate ap\.t6999900000003, not ap\.t4999900000005/u);
    expect(() => routeOf(gated({ gateLabel: "treasury" }))).toThrow(/enforces the mandate treasury\.t4999900000005/u);
    expect(() => routeOf(gated({ mandate: undefined }))).toThrow(/needs MANDATE_PRINCIPAL/u);
  });

  it("is off by default in the config, and on only with a gate address", () => {
    const required = { AGENT_PRIVATE_KEY: `0x${"11".repeat(32)}`, SIGNER_TOKEN: "t".repeat(64), SEPOLIA_RPC_URL: "http://127.0.0.1:8545", VAULT_ADDRESS: VAULT };
    expect(loadConfig(required).SIGNER_VIA_GATE).toBe("0");
    expect(() => loadConfig({ ...required, SIGNER_VIA_GATE: "1" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...required, SIGNER_VIA_GATE: "1", MANDATE_GATE_ADDRESS: GATE })).toThrow(/MANDATE_PRINCIPAL/u);
    expect(loadConfig({ ...required, SIGNER_VIA_GATE: "1", MANDATE_GATE_ADDRESS: GATE, MANDATE_PRINCIPAL: "4999900000005" })).toMatchObject({ SIGNER_VIA_GATE: "1", MANDATE_LABEL: "ap" });
  });
});

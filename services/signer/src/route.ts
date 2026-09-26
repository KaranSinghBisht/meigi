import { agentVaultAbi, mandateGateAbi } from "@meigi/abi";
import { getAddress, zeroAddress, type Address, type PublicClient } from "viem";

/**
 * Where the signer sends payInvoice. Normally the vault, whose agent is this key. With SIGNER_VIA_GATE=1, the vault's
 * agent is the MandateGate at MANDATE_GATE_ADDRESS. The gate forwards payInvoice, with the same arguments, only while
 * the buyer company's ENS name for this agent answers and is held by this key. Either way the startup check is strict:
 * the chain must already match the setting. The rollback is `vault.setAgent(<this key>)`, SIGNER_VIA_GATE=0 and a
 * restart.
 */

export type Via = "vault" | "gate";

export interface Route {
  target: Address; // the contract payInvoice is sent to
  via: Via;
  gate: Address | null;
}

export class RouteError extends Error {
  override readonly name = "RouteError";
}

export interface RouteFacts {
  key: Address;
  vault: Address;
  owner: Address;
  vaultAgent: Address;
  viaGate: boolean; // SIGNER_VIA_GATE=1
  gate: Address | null; // MANDATE_GATE_ADDRESS, required when viaGate
  gateVault?: Address; // gate.vault(), read only when viaGate
  holder?: Address; // gate.holder(): the key the mandate authorises, zero while it doesn't answer
}

/** The route for these on-chain facts, or why the signer must not start. */
export function routeOf(facts: RouteFacts): Route {
  const same = (a: Address, b: Address) => getAddress(a) === getAddress(b);
  if (same(facts.key, facts.owner)) throw new RouteError("AGENT_PRIVATE_KEY is the vault owner's key; the signer holds the agent key only");
  if (!facts.viaGate) {
    if (same(facts.vaultAgent, facts.key)) return { target: facts.vault, via: "vault", gate: null };
    const hint = facts.gate && same(facts.vaultAgent, facts.gate) ? ": it is the MandateGate, so set SIGNER_VIA_GATE=1" : "";
    throw new RouteError(`AGENT_PRIVATE_KEY is ${facts.key}, but the vault's agent is ${facts.vaultAgent}${hint}`);
  }
  if (!facts.gate) throw new RouteError("SIGNER_VIA_GATE=1 needs MANDATE_GATE_ADDRESS");
  if (!same(facts.vaultAgent, facts.gate)) throw new RouteError(`SIGNER_VIA_GATE=1, but the vault's agent is ${facts.vaultAgent}, not the MandateGate ${facts.gate}`);
  if (!facts.gateVault || !same(facts.gateVault, facts.vault)) {
    throw new RouteError(`MANDATE_GATE_ADDRESS forwards to ${facts.gateVault ?? "an unknown vault"}, not the vault ${facts.vault}`);
  }
  const holder = facts.holder ?? zeroAddress;
  if (!same(holder, facts.key)) {
    const why = same(holder, zeroAddress) ? "doesn't answer (revoked, expired or frozen)" : `authorises ${holder}`;
    throw new RouteError(`the ENS mandate ${why}, not this key ${facts.key}`);
  }
  return { target: facts.gate, via: "gate", gate: facts.gate };
}

/** Reads the facts the route depends on. */
export async function readRoute(client: PublicClient, key: Address, vault: Address, via: { viaGate: boolean; gate: Address | null }): Promise<Route> {
  const at = { address: vault, abi: agentVaultAbi } as const;
  const [vaultAgent, owner] = await Promise.all([client.readContract({ ...at, functionName: "agent" }), client.readContract({ ...at, functionName: "owner" })]);
  const { viaGate, gate } = via;
  const facts: RouteFacts = { key, vault, owner, vaultAgent, viaGate, gate };
  if (viaGate && gate) {
    const g = { address: gate, abi: mandateGateAbi } as const;
    [facts.gateVault, facts.holder] = await Promise.all([client.readContract({ ...g, functionName: "vault" }), client.readContract({ ...g, functionName: "holder" })]);
  }
  return routeOf(facts);
}

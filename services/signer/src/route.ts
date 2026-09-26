import { agentVaultAbi, mandateGateAbi } from "@meigi/abi";
import { getAddress, zeroAddress, type Address, type PublicClient } from "viem";

/**
 * Where the signer sends payInvoice. Normally the vault, whose agent is this key. With an ENS mandate
 * (MANDATE_GATE_ADDRESS), the vault's agent is the MandateGate. The gate forwards payInvoice, with the same arguments,
 * only while the buyer company's name for this agent answers and is held by this key. Whatever the vault's agent is at
 * startup decides the route, so the rollback (`vault.setAgent(<this key>)`) needs only a restart.
 */

export type Via = "vault" | "gate";

export interface Route {
  target: Address; // the contract payInvoice is sent to
  via: Via;
  gate: Address | null;
  warning: string | null; // e.g. the mandate doesn't answer at startup
}

export class RouteError extends Error {
  override readonly name = "RouteError";
}

export interface RouteFacts {
  key: Address;
  vault: Address;
  owner: Address;
  vaultAgent: Address;
  gate: Address | null; // MANDATE_GATE_ADDRESS
  gateVault?: Address; // gate.vault(), read only when the vault's agent is the gate
  holder?: Address; // gate.holder(): the key the mandate authorises, zero while it doesn't answer
}

/** The route for these on-chain facts, or why the signer must not start. */
export function routeOf(facts: RouteFacts): Route {
  const same = (a: Address, b: Address) => getAddress(a) === getAddress(b);
  if (same(facts.key, facts.owner)) throw new RouteError("AGENT_PRIVATE_KEY is the vault owner's key; the signer holds the agent key only");
  if (same(facts.vaultAgent, facts.key)) return { target: facts.vault, via: "vault", gate: facts.gate, warning: null };
  if (!facts.gate || !same(facts.vaultAgent, facts.gate)) {
    const gate = facts.gate ? ` or MANDATE_GATE_ADDRESS ${facts.gate}` : "";
    throw new RouteError(`AGENT_PRIVATE_KEY is ${facts.key}, but the vault's agent is ${facts.vaultAgent}, not this key${gate}`);
  }
  if (!facts.gateVault || !same(facts.gateVault, facts.vault)) {
    throw new RouteError(`MANDATE_GATE_ADDRESS forwards to ${facts.gateVault ?? "an unknown vault"}, not the vault ${facts.vault}`);
  }
  const holder = facts.holder ?? zeroAddress;
  if (same(holder, zeroAddress)) {
    return { target: facts.gate, via: "gate", gate: facts.gate, warning: "the ENS mandate doesn't answer right now: payments revert with MandateNotLive until it does" };
  }
  if (!same(holder, facts.key)) throw new RouteError(`the ENS mandate authorises ${holder}, not this key ${facts.key}`);
  return { target: facts.gate, via: "gate", gate: facts.gate, warning: null };
}

/** Reads the facts the route depends on. */
export async function readRoute(client: PublicClient, key: Address, vault: Address, gate: Address | null): Promise<Route> {
  const at = { address: vault, abi: agentVaultAbi } as const;
  const [vaultAgent, owner] = await Promise.all([client.readContract({ ...at, functionName: "agent" }), client.readContract({ ...at, functionName: "owner" })]);
  const facts: RouteFacts = { key, vault, owner, vaultAgent, gate };
  if (gate && getAddress(vaultAgent) === getAddress(gate)) {
    const g = { address: gate, abi: mandateGateAbi } as const;
    [facts.gateVault, facts.holder] = await Promise.all([client.readContract({ ...g, functionName: "vault" }), client.readContract({ ...g, functionName: "holder" })]);
  }
  return routeOf(facts);
}

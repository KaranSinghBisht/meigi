import { agentVaultAbi, mockJPYCAbi, payeeRegistryAbi, payRouterAbi } from "@meigi/abi";
import { z } from "zod";
import { MultiBaasUnavailable, type MultiBaas } from "./client.js";
import { CONTRACT_VERSION, CONTRACTS, QUERIES, REQUIRED_EVENTS } from "./labels.js";

/**
 * Makes a MultiBaas deployment index Meigi's contracts on its chain. Idempotent: every step checks first.
 *   1. each contract's ABI, from MultiBaas's own explorer lookup (Sourcify / Etherscan) or else our @meigi/abi copy;
 *   2. the contract in MultiBaas's library, the address alias, and the link with event indexing from `startBlock`;
 *   3. the saved event queries the agent and the dashboards run.
 */

export interface Deployment {
  chainId: number;
  registry: string;
  vault: string;
  router?: string;
  token: string;
  startBlock: number; // where event indexing starts: the deployment's first block
}

const OUR_ABI = { registry: payeeRegistryAbi, vault: agentVaultAbi, router: payRouterAbi, token: mockJPYCAbi } as const;

const address = z.object({
  contracts: z.array(z.object({ label: z.string() }).passthrough()).default([]),
  contractLookup: z.array(z.object({ abi: z.string().optional(), verified: z.boolean().optional() }).passthrough()).optional(),
});

const KEYS = ["registry", "vault", "router", "token"] as const;

export async function setupMultiBaas(mb: MultiBaas, deployment: Deployment, log: (line: string) => void): Promise<void> {
  await mb.requireChain(deployment.chainId); // never write one chain's addresses into another chain's deployment
  for (const key of KEYS) {
    const at = deployment[key];
    if (!at) continue; // e.g. no PayRouter on this deployment
    await ensureContract(mb, key, await abiFor(mb, at, key, log), log);
    await ensureLinked(mb, key, at, deployment.startBlock, log);
  }
  await saveQueries(mb, log);
}

/** The half that needs no addresses (our ABIs and the saved queries), so a fresh deploy only waits for the links. */
export async function prepareLibrary(mb: MultiBaas, chainId: number, log: (line: string) => void): Promise<void> {
  await mb.requireChain(chainId);
  for (const key of KEYS) await ensureContract(mb, key, JSON.stringify(OUR_ABI[key]), log);
  await saveQueries(mb, log);
}

async function ensureContract(mb: MultiBaas, key: (typeof KEYS)[number], rawAbi: string, log: (line: string) => void) {
  const contract = CONTRACTS[key];
  if (!(await missing(() => mb.call("GET", `/contracts/${contract.label}`)))) return;
  // `bin` is optional in the API docs, but MultiBaas stores it NOT NULL: an empty one is stored as "0x".
  await mb.call("POST", `/contracts/${contract.label}`, { label: contract.label, contractName: contract.contractName, version: CONTRACT_VERSION, bin: "", rawAbi });
  log(`added ${contract.contractName} to the library as ${contract.label}`);
}

async function ensureLinked(mb: MultiBaas, key: (typeof KEYS)[number], at: string, startBlock: number, log: (line: string) => void) {
  const contract = CONTRACTS[key];
  if (await missing(() => mb.call("GET", `/chains/ethereum/addresses/${contract.alias}`))) {
    await mb.call("POST", "/chains/ethereum/addresses", { alias: contract.alias, address: at });
    log(`aliased ${at} as ${contract.alias}`);
  }
  const linked = address.parse(await mb.call("GET", `/chains/ethereum/addresses/${contract.alias}`)).contracts;
  if (!linked.some((c) => c.label === contract.label)) await link(mb, contract, startBlock, log);
}

async function saveQueries(mb: MultiBaas, log: (line: string) => void) {
  for (const [name, definition] of Object.entries(QUERIES)) {
    await mb.call("PUT", `/queries/${name}`, definition);
    log(`saved event query ${name}`);
  }
}

/**
 * Links the address to the contract with event indexing from `startBlock`. A plan that caps how far back past logs
 * are read (the free plan: 100 blocks) may refuse that; then indexing starts 100 blocks back, and older events are
 * not in MultiBaas.
 */
async function link(mb: MultiBaas, contract: (typeof CONTRACTS)[keyof typeof CONTRACTS], startBlock: number, log: (line: string) => void) {
  const path = `/chains/ethereum/addresses/${contract.alias}/contracts`;
  const body = { label: contract.label, version: CONTRACT_VERSION };
  try {
    await mb.call("POST", path, { ...body, startingBlock: String(startBlock) });
    log(`linked ${contract.alias} to ${contract.label}, indexing events from block ${startBlock}`);
  } catch (error) {
    if (!(error instanceof MultiBaasUnavailable) || error.status === null || error.status >= 500) throw error;
    await mb.call("POST", path, { ...body, startingBlock: "-100" });
    log(`linked ${contract.alias} to ${contract.label}, indexing from 100 blocks back (the plan refused block ${startBlock})`);
  }
}

/** MultiBaas's explorer lookup of the verified contract (Sourcify / Etherscan), or our own ABI when it has none. */
async function abiFor(mb: MultiBaas, at: string, key: keyof typeof OUR_ABI, log: (line: string) => void): Promise<string> {
  const lookup = address.safeParse(await mb.call("GET", `/chains/ethereum/addresses/${at}?include=contractLookup`).catch(unavailableAsNull));
  const verified = lookup.success ? lookup.data.contractLookup?.find((c) => c.verified && c.abi && hasEvents(c.abi, key)) : undefined;
  if (verified?.abi) {
    log(`${CONTRACTS[key].contractName}: ABI imported from its verified source`);
    return verified.abi;
  }
  log(`${CONTRACTS[key].contractName}: no verified source found, using the repo's ABI`);
  return JSON.stringify(OUR_ABI[key]);
}

/** A verified ABI is only usable when it declares the events we query (a proxy's own ABI doesn't). */
function hasEvents(abi: string, key: keyof typeof REQUIRED_EVENTS): boolean {
  let items: unknown;
  try {
    items = JSON.parse(abi);
  } catch {
    return false; // not JSON: use ours
  }
  const parsed = z.array(z.object({ type: z.string(), name: z.string().optional() }).passthrough()).safeParse(items);
  return parsed.success && REQUIRED_EVENTS[key].every((name) => parsed.data.some((item) => item.type === "event" && item.name === name));
}

/** An optional read: MultiBaas having no answer is null, anything unexpected still throws. */
function unavailableAsNull(error: unknown): null {
  if (error instanceof MultiBaasUnavailable) return null;
  throw error;
}

/** True when MultiBaas answers 404 (the thing doesn't exist yet). Any other failure stops the setup. */
async function missing(read: () => Promise<unknown>): Promise<boolean> {
  try {
    await read();
    return false;
  } catch (error) {
    if (error instanceof MultiBaasUnavailable && error.status === 404) return true;
    throw error;
  }
}

/** Event indexing progress per linked contract, for the setup script's report. */
export async function indexingStatus(mb: MultiBaas, deployment: Deployment): Promise<string[]> {
  const lines: string[] = [];
  for (const [key, contract] of Object.entries(CONTRACTS)) {
    if (!deployment[key as keyof typeof CONTRACTS]) continue;
    const status = z
      .object({ latestBlockNumber: z.number(), startBlockNumber: z.number(), isProcessingPastLogs: z.boolean() })
      .safeParse(await mb.call("GET", `/chains/ethereum/addresses/${contract.alias}/contracts/${contract.label}/status`).catch(unavailableAsNull));
    lines.push(
      status.success
        ? `${contract.label}: indexed ${status.data.startBlockNumber}→${status.data.latestBlockNumber}${status.data.isProcessingPastLogs ? " (still catching up)" : ""}`
        : `${contract.label}: no indexing status yet`,
    );
  }
  return lines;
}

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, type Address } from "viem";
import { AnalysisStore } from "./analysis/store.js";
import type { HoldPolicy } from "./analysis/verdict.js";
import { createApprovals, type ApprovalService } from "./approval/approvals.js";
import { createApproverRegistry } from "./approval/approvers.js";
import { createIdp } from "./approval/idp.js";
import { createAuditLog, type AuditLog } from "./audit/log.js";
import { createMultiBaasHistory } from "./history/multibaas.js";
import { createIndexedNetwork } from "./history/network.js";
import { createRpcHistory } from "./history/rpc.js";
import { createMultiBaas } from "./multibaas/client.js";
import { V2_START_BLOCK } from "./multibaas/labels.js";
import { createClients } from "./chain/clients.js";
import { createRemotePayer, SignerUnavailable, type RemotePayer } from "./chain/remote-payer.js";
import { ConfigMismatchError, createChainReader } from "./chain/reader.js";
import type { Config } from "./config.js";
import type { AppDeps } from "./deps.js";
import { parseTNumber } from "./extract/tnumber.js";
import { createAnthropicLlm } from "./llm/anthropic.js";
import { createLocalLlm } from "./llm/local.js";
import type { LlmPort } from "./llm/types.js";
import { createWorkersAiLlm } from "./llm/workers-ai.js";
import { createScanCache } from "./screening/cache.js";
import { createIntercepta } from "./screening/intercepta.js";
import { systemOneBackend, type TriageBackend } from "./triage/backends.js";
import { createTriage } from "./triage/triage.js";

const DEMO_DIR = fileURLToPath(new URL("../scripts/demo-invoices/", import.meta.url));
/** services/agent: relative data paths resolve here, whatever the working directory. */
const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

/** Builds every dependency from validated configuration. */
export function buildDeps(config: Config) {
  const { publicClient } = createClients(config.SEPOLIA_RPC_URL, config.CHAIN_ID);
  const vault = config.VAULT_ADDRESS as Address;
  const agent = getAddress(config.AGENT_ADDRESS);
  // One file per chain: the Sepolia agent and a local-chain agent never append to the same chain of hashes.
  const audit = createAuditLog(packagePath(config.AUDIT_LOG_PATH ?? `../../data/agent/audit-${config.CHAIN_ID}.jsonl`));
  // Each exchange with the signer goes in the audit log too, so its chain covers the signing step.
  const signer = createRemotePayer({ url: config.SIGNER_URL, token: config.SIGNER_TOKEN, observe: (event, fields) => audit.record(event, fields) });
  const chain = createChainReader({
    client: publicClient,
    chainId: config.CHAIN_ID,
    vault,
    agent,
    registry: config.REGISTRY_ADDRESS as Address,
    token: config.TOKEN_ADDRESS as Address | undefined,
    ...(config.SIGNER_VIA_GATE === "1" && config.MANDATE_GATE_ADDRESS && config.MANDATE_PRINCIPAL
      ? { gate: getAddress(config.MANDATE_GATE_ADDRESS), mandate: { principal: BigInt(config.MANDATE_PRINCIPAL), label: config.MANDATE_LABEL } }
      : {}),
  });
  const triageBackends = createTriageBackends(config);
  const llm = createLlm(config);
  const screening = createIntercepta({
    apiKey: config.INTERCEPTA_API_KEY,
    cache: createScanCache(packagePath(config.INTERCEPTA_CACHE_PATH)),
    maxCalls: config.INTERCEPTA_MAX_CALLS,
    toxicThreshold: config.INTERCEPTA_TOXIC_THRESHOLD,
  });
  const approvals = createApprovalService(config, audit);
  const fromBlock = historyFrom(config);
  const multibaas = (url?: string, apiKey?: string) => (url && apiKey ? createMultiBaas({ url, apiKey }) : null);
  const sameChain = multibaas(config.MULTIBAAS_URL, config.MULTIBAAS_API_KEY);
  const awaji = multibaas(config.MULTIBAAS_AWAJI_URL, config.MULTIBAAS_AWAJI_API_KEY);
  const history = {
    multibaas: sameChain ? createMultiBaasHistory(sameChain, config.CHAIN_ID) : null, // RPC logs cover the blocks before its index
    rpc: createRpcHistory({ client: publicClient, vault, token: async () => (await chain.token()).address, fromBlock }),
    mizuhiki: awaji ? createIndexedNetwork(awaji) : null,
  };
  const deps: AppDeps = {
    chain,
    payer: signer,
    signer,
    triage: createTriage(triageBackends, config.TRIAGE_MIN_P_SAFE),
    llm,
    screening,
    store: new AnalysisStore(),
    vendorTNumbers: parseVendorList(config.VENDOR_T_NUMBERS),
    origins: config.APP_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    allowedHosts: allowedHosts(config.AGENT_PORT, config.AGENT_ALLOWED_HOSTS),
    triageRequired: config.TRIAGE_REQUIRED,
    holds: { maxPressure: config.TRIAGE_MAX_PRESSURE, autoClearMaxYen: config.AUTO_CLEAR_MAX_YEN ?? null },
    approvals,
    history,
    audit,
    apiToken: config.AGENT_API_TOKEN ?? null,
    demoDir: DEMO_DIR,
    info: {
      chainId: config.CHAIN_ID,
      vault,
      agent,
      triage: triageBackends.map((backend) => backend.name),
      triageRequired: config.TRIAGE_REQUIRED,
      llm: llm ? `${llm.provider}:${llm.model}` : "none",
      screening: screening.enabled,
      humanApproval: approvals !== null,
      multibaas: history.multibaas !== null,
      mizuhiki: history.mizuhiki !== null,
    },
  };
  const init = async () => {
    await chain.init();
    await checkSigner(signer, config, deps.holds);
  };
  return { deps, init };
}

/**
 * The signer must hold this vault's agent key on this chain. Its ceiling becomes the agent's auto-clear budget, so a
 * payment it would refuse is held for a verified human here instead. Unreachable: payments wait until it's up.
 */
async function checkSigner(signer: RemotePayer, config: Config, holds: HoldPolicy): Promise<void> {
  let health;
  try {
    health = await signer.health();
  } catch (error) {
    if (!(error instanceof SignerUnavailable)) throw error;
    process.stderr.write(`[agent] the signer at ${config.SIGNER_URL} isn't reachable yet: payments wait for it\n`);
    return;
  }
  if (getAddress(health.agent) !== getAddress(config.AGENT_ADDRESS)) {
    throw new ConfigMismatchError(`the signer holds ${health.agent}'s key, but AGENT_ADDRESS is ${config.AGENT_ADDRESS}`);
  }
  if (getAddress(health.vault) !== getAddress(config.VAULT_ADDRESS) || health.chainId !== config.CHAIN_ID) {
    throw new ConfigMismatchError(`the signer pays from vault ${health.vault} on chain ${health.chainId}, not ${config.VAULT_ADDRESS} on ${config.CHAIN_ID}`);
  }
  holds.autoClearMaxYen = Math.min(holds.autoClearMaxYen ?? Number.POSITIVE_INFINITY, health.humanAboveYen);
}

/** World ID for Agents: a verified human may release a held payment. Off unless both client values are set. */
function createApprovalService(config: Config, audit: AuditLog): ApprovalService | null {
  const clientId = config.WORLD_AGENTS_CLIENT_ID;
  const clientSecret = config.WORLD_AGENTS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const idp = createIdp({ issuer: config.WORLD_AGENTS_ISSUER, clientId, clientSecret, authMethod: config.WORLD_AGENTS_AUTH_METHOD });
  const allowed = config.WORLD_AGENTS_APPROVERS.split(",").map((sub) => sub.trim()).filter(Boolean);
  const path = packagePath(config.WORLD_AGENTS_APPROVERS_PATH);
  const approvers = createApproverRegistry({ allowed, path, enroll: config.WORLD_AGENTS_ENROLL });
  const record = (event: string, fields: Record<string, unknown>) => {
    try {
      audit.record(event, fields);
    } catch (error) {
      process.stderr.write(`[agent] audit log write failed for ${event}: ${error instanceof Error ? error.name : "error"}\n`);
    }
  };
  return createApprovals({ idp, approvers, record, trace: config.WORLD_AGENTS_TRACE });
}

function createTriageBackends(config: Config): TriageBackend[] {
  const wanted = config.TRIAGE_BACKENDS.split(",").map((b) => b.trim());
  const backends: TriageBackend[] = [];
  for (const name of wanted) {
    if (name === "systemone") {
      backends.push(systemOneBackend({ url: config.SYSTEMONE_URL, apiKey: config.SYSTEMONE_API_KEY, model: config.SYSTEMONE_MODEL }));
    }
    if (name === "proxy" && config.AI_PROXY_URL && config.AI_PROXY_TOKEN) {
      const url = new URL("/v1/systemone", config.AI_PROXY_URL).toString();
      backends.push(systemOneBackend({ name: "proxy", url, apiKey: config.AI_PROXY_TOKEN, model: "jev-latest", timeoutMs: 15_000 }));
    }
  }
  return backends;
}

function createLlm(config: Config): LlmPort | null {
  if (config.LLM_PROVIDER === "local") {
    return createLocalLlm({ url: config.LOCAL_LLM_URL, model: config.LOCAL_LLM_MODEL, timeoutMs: config.LOCAL_LLM_TIMEOUT_MS });
  }
  if (config.LLM_PROVIDER === "anthropic") {
    return createAnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY!, model: config.ANTHROPIC_MODEL });
  }
  if (config.LLM_PROVIDER === "proxy") {
    const url = new URL("/v1/chat", config.AI_PROXY_URL!).toString();
    return createWorkersAiLlm({ provider: "proxy", url, token: config.AI_PROXY_TOKEN!, model: config.WORKERS_AI_MODEL });
  }
  return null; // config refuses workers-ai: it would call Cloudflare outside the proxy's daily budget
}

/** RPC log scans start at the v2 deployment on Sepolia (nothing earlier is ours), at 0 on a local chain. */
function historyFrom(config: Config): bigint {
  if (config.HISTORY_FROM_BLOCK !== undefined) return BigInt(config.HISTORY_FROM_BLOCK);
  return config.CHAIN_ID === 11155111 ? BigInt(V2_START_BLOCK) : 0n;
}

/** localhost, 127.0.0.1 and [::1], bare and with the port, plus any extra names (for LAN use). */
export function allowedHosts(port: number, extra: string): string[] {
  const local = ["localhost", "127.0.0.1", "[::1]"].flatMap((host) => [host, `${host}:${port}`]);
  return [...local, ...extra.split(",").map((host) => host.trim()).filter(Boolean)];
}

/** A data path from the configuration, relative to services/agent (not the working directory); absolute stays. */
export function packagePath(path: string): string {
  return resolve(PACKAGE_DIR, path);
}

/** "T2011001234567, 3999905000001" → ["2011001234567", "3999905000001"]; a malformed entry is a startup error. */
export function parseVendorList(list: string): string[] {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const digits = parseTNumber(entry);
      if (!digits) throw new Error(`VENDOR_T_NUMBERS: "${entry}" is not a T-number`);
      return digits;
    });
}

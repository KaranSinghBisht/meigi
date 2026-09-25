import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, Hex } from "viem";
import { AnalysisStore } from "./analysis/store.js";
import { createApprovals, type ApprovalService } from "./approval/approvals.js";
import { createApproverRegistry } from "./approval/approvers.js";
import { createIdp } from "./approval/idp.js";
import { createClients } from "./chain/clients.js";
import { createPayer } from "./chain/payer.js";
import { createChainReader } from "./chain/reader.js";
import type { Config } from "./config.js";
import type { AppDeps } from "./deps.js";
import { parseTNumber } from "./extract/tnumber.js";
import { createAnthropicLlm } from "./llm/anthropic.js";
import type { LlmPort } from "./llm/types.js";
import { createWorkersAiLlm } from "./llm/workers-ai.js";
import { createScanCache } from "./screening/cache.js";
import { createIntercepta } from "./screening/intercepta.js";
import { cloudflareJevBackend, systemOneBackend, type TriageBackend } from "./triage/backends.js";
import { createTriage } from "./triage/triage.js";

const DEMO_DIR = fileURLToPath(new URL("../scripts/demo-invoices/", import.meta.url));
/** services/agent: relative data paths resolve here, whatever the working directory. */
const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

/** Builds every dependency from validated configuration. */
export function buildDeps(config: Config) {
  const { publicClient, walletClient, account } = createClients(config.SEPOLIA_RPC_URL, config.CHAIN_ID, config.AGENT_PRIVATE_KEY as Hex);
  const vault = config.VAULT_ADDRESS as Address;
  const chain = createChainReader({
    client: publicClient,
    chainId: config.CHAIN_ID,
    vault,
    agent: account.address,
    registry: config.REGISTRY_ADDRESS as Address,
    token: config.TOKEN_ADDRESS as Address | undefined,
  });
  const triageBackends = createTriageBackends(config);
  const llm = createLlm(config);
  const screening = createIntercepta({
    apiKey: config.INTERCEPTA_API_KEY,
    cache: createScanCache(packagePath(config.INTERCEPTA_CACHE_PATH)),
    maxCalls: config.INTERCEPTA_MAX_CALLS,
    toxicThreshold: config.INTERCEPTA_TOXIC_THRESHOLD,
  });
  const approvals = createApprovalService(config);
  const deps: AppDeps = {
    chain,
    payer: createPayer({ publicClient, walletClient, vault }),
    triage: createTriage(triageBackends, config.TRIAGE_MIN_P_SAFE),
    llm,
    screening,
    store: new AnalysisStore(),
    vendorTNumbers: parseVendorList(config.VENDOR_T_NUMBERS),
    origins: config.APP_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    triageRequired: config.TRIAGE_REQUIRED,
    holds: { maxPressure: config.TRIAGE_MAX_PRESSURE, autoClearMaxYen: config.AUTO_CLEAR_MAX_YEN ?? null },
    approvals,
    apiToken: config.AGENT_API_TOKEN ?? null,
    demoDir: DEMO_DIR,
    info: {
      chainId: config.CHAIN_ID,
      vault,
      agent: account.address,
      triage: triageBackends.map((backend) => backend.name),
      triageRequired: config.TRIAGE_REQUIRED,
      llm: llm ? `${llm.provider}:${llm.model}` : "none",
      screening: screening.enabled,
      humanApproval: approvals !== null,
    },
  };
  return { deps, init: chain.init };
}

/** World ID for Agents: a verified human may release a held payment. Off unless both client values are set. */
function createApprovalService(config: Config): ApprovalService | null {
  const clientId = config.WORLD_AGENTS_CLIENT_ID;
  const clientSecret = config.WORLD_AGENTS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const idp = createIdp({ issuer: config.WORLD_AGENTS_ISSUER, clientId, clientSecret, authMethod: config.WORLD_AGENTS_AUTH_METHOD });
  const allowed = config.WORLD_AGENTS_APPROVERS.split(",").map((sub) => sub.trim()).filter(Boolean);
  const path = packagePath(config.WORLD_AGENTS_APPROVERS_PATH);
  const approvers = createApproverRegistry({ allowed, path, enroll: config.WORLD_AGENTS_ENROLL });
  return createApprovals({ idp, approvers, trace: config.WORLD_AGENTS_TRACE });
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
    if (name === "cloudflare" && config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_API_TOKEN) {
      backends.push(cloudflareJevBackend({ accountId: config.CLOUDFLARE_ACCOUNT_ID, apiToken: config.CLOUDFLARE_API_TOKEN }));
    }
  }
  return backends;
}

function createLlm(config: Config): LlmPort | null {
  if (config.LLM_PROVIDER === "anthropic") {
    return createAnthropicLlm({ apiKey: config.ANTHROPIC_API_KEY!, model: config.ANTHROPIC_MODEL });
  }
  if (config.LLM_PROVIDER === "proxy") {
    const url = new URL("/v1/chat", config.AI_PROXY_URL!).toString();
    return createWorkersAiLlm({ provider: "proxy", url, token: config.AI_PROXY_TOKEN!, model: config.WORKERS_AI_MODEL });
  }
  if (config.LLM_PROVIDER === "workers-ai") return createWorkersAiLlm({ provider: "workers-ai", ...workersAiTarget(config) });
  return null;
}

/** WORKERS_AI_URL if set, else the Cloudflare REST API for the account. */
function workersAiTarget(config: Config) {
  const model = config.WORKERS_AI_MODEL;
  const token = (config.WORKERS_AI_TOKEN ?? config.CLOUDFLARE_API_TOKEN)!;
  if (config.WORKERS_AI_URL) return { url: config.WORKERS_AI_URL, token, model };
  return { url: `https://api.cloudflare.com/client/v4/accounts/${config.CLOUDFLARE_ACCOUNT_ID}/ai/run/${model}`, token, model };
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

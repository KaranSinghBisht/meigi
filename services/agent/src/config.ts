import { z } from "zod";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an address");
/** In a dotenv file an empty value means "not set". */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const probability = z.coerce.number().min(0).max(1);
/** https, or plain http on this machine only (a local model, a mock IdP). */
const secureOrLoopback = (url: string) => {
  if (!URL.canParse(url)) return false;
  const { protocol, hostname } = new URL(url);
  return protocol === "https:" || (protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(hostname));
};

const schema = z
  .object({
    SEPOLIA_RPC_URL: z.url(),
    CHAIN_ID: z.coerce.number().int().positive().default(11155111),
    // The agent holds no key: services/signer does, and signs payInvoice for it over localhost.
    AGENT_ADDRESS: address, // the vault's agent, whose key only the signer holds
    SIGNER_URL: z.url().refine(secureOrLoopback, "must be https, or http on loopback").default("http://127.0.0.1:8796"),
    SIGNER_TOKEN: z.string().min(32), // the shared secret the signer checks on every call (.env and .env.signer)
    REGISTRY_ADDRESS: address,
    VAULT_ADDRESS: address,
    TOKEN_ADDRESS: optional(address),
    VENDOR_T_NUMBERS: z.string().default("2011001234567"),
    AGENT_PORT: z.coerce.number().int().positive().default(8788),
    AGENT_HOST: z.string().default("127.0.0.1"), // 0.0.0.0 to serve the LAN (then set AGENT_API_TOKEN)
    AGENT_API_TOKEN: optional(z.string().min(16)), // if set, every POST needs Authorization: Bearer <token>
    AGENT_ALLOWED_HOSTS: z.string().default(""), // extra Host names for LAN use, e.g. "192.168.1.20:8788"
    APP_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),
    // System-1 triage
    // Local only by default: the fine-tuned Kev on this machine. "proxy" (Jev through workers/ai-proxy, which spends
    // AI Gateway credits) and "cloudflare" (Jev over the REST API) are opt-in fallbacks.
    TRIAGE_BACKENDS: z.string().default("systemone"),
    TRIAGE_REQUIRED: flag.default(true),
    TRIAGE_MIN_P_SAFE: probability.default(0.9),
    SYSTEMONE_URL: z.url().refine(secureOrLoopback, "must be https, or http on loopback").default("http://127.0.0.1:8102/v1/systemone"), // the fine-tuned payee-0.8b (kev.serve)
    SYSTEMONE_API_KEY: optional(z.string()),
    SYSTEMONE_MODEL: z.string().default("kev-latest"),
    CLOUDFLARE_ACCOUNT_ID: optional(z.string().regex(/^[0-9a-f]{32}$/u, "must be a 32-character account id")),
    CLOUDFLARE_API_TOKEN: optional(z.string()),
    // The team's Cloudflare Worker (workers/ai-proxy): /v1/systemone (Jev) and /v1/chat (Workers AI Llama)
    AI_PROXY_URL: optional(z.url().refine(secureOrLoopback, "must be https, or http on loopback")), // carries AI_PROXY_TOKEN
    AI_PROXY_TOKEN: optional(z.string()),
    // System-2 LLM
    LLM_PROVIDER: z.enum(["local", "proxy", "anthropic", "workers-ai", "none"]).default("local"),
    // local: an OpenAI-compatible server on this machine (Ollama); no key
    LOCAL_LLM_URL: z
      .url()
      .refine(secureOrLoopback, "must be https, or http on loopback")
      .default("http://127.0.0.1:11434/v1")
      .transform((v) => v.replace(/\/+$/u, "")),
    LOCAL_LLM_MODEL: z.string().min(1).default("llama3.1:8b"),
    LOCAL_LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    ANTHROPIC_API_KEY: optional(z.string()),
    ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
    WORKERS_AI_MODEL: z.string().default("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
    WORKERS_AI_URL: optional(z.url().refine(secureOrLoopback, "must be https, or http on loopback")), // carries a token
    WORKERS_AI_TOKEN: optional(z.string()),
    // Intercepta screening
    INTERCEPTA_API_KEY: optional(z.string()),
    INTERCEPTA_CACHE_PATH: z.string().default("../../data/agent/intercepta-cache.json"), // relative to services/agent
    AUDIT_LOG_PATH: optional(z.string().min(1)), // hash-chained JSONL (default ../../data/agent/audit-<CHAIN_ID>.jsonl), relative to services/agent
    INTERCEPTA_MAX_CALLS: z.coerce.number().int().nonnegative().default(900),
    INTERCEPTA_TOXIC_THRESHOLD: z.coerce.number().min(0).max(100).default(50),
    // MultiBaas (Curvegrid): indexed settlement history. Off unless both are set; RPC logs otherwise
    MULTIBAAS_URL: optional(z.url().refine((v) => v.startsWith("https://"), "must be https")), // on the agent's chain
    MULTIBAAS_API_KEY: optional(z.string().min(16)),
    MULTIBAAS_AWAJI_URL: optional(z.url().refine((v) => v.startsWith("https://"), "must be https")), // on Mizuhiki Awaji
    MULTIBAAS_AWAJI_API_KEY: optional(z.string().min(16)),
    HISTORY_FROM_BLOCK: optional(z.coerce.number().int().nonnegative()), // RPC log scans start here (default: v2 deploy block on Sepolia, 0 elsewhere)
    // Holds only a verified human may release (with World ID for Agents, below)
    TRIAGE_MAX_PRESSURE: probability.default(0.5), // System-1 pressure above this holds the payment
    AUTO_CLEAR_MAX_YEN: optional(z.coerce.number().int().positive()), // amounts above this never auto-clear
    // World ID for Agents (RFC 8628 device grant): off unless both client values are set
    WORLD_AGENTS_ISSUER: z
      .url()
      .refine(secureOrLoopback, "must be https (http only on loopback, for a local mock IdP)")
      .default("https://sandbox.auth.world.org")
      .transform((v) => v.replace(/\/+$/u, "")),
    WORLD_AGENTS_CLIENT_ID: optional(z.string().min(1)),
    WORLD_AGENTS_CLIENT_SECRET: optional(z.string().min(1)),
    WORLD_AGENTS_AUTH_METHOD: z.enum(["client_secret_basic", "client_secret_post"]).default("client_secret_basic"),
    WORLD_AGENTS_APPROVERS: z.string().default(""), // pairwise subs, matched exactly
    WORLD_AGENTS_ENROLL: flag.default(false), // on: the first approved proof enrolls (while nobody is enrolled)
    WORLD_AGENTS_APPROVERS_PATH: z.string().default("../../data/agent/approvers.json"), // relative to services/agent
    WORLD_AGENTS_TRACE: flag.default(false), // rehearsals: log each ID token's claim shape (never the sub) to stderr
  })
  .superRefine((env, ctx) => {
    const require = (key: string, when: boolean, message = "required by the selected provider") => {
      if (when) ctx.addIssue({ code: "custom", path: [key], message });
    };
    require("ANTHROPIC_API_KEY", env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY);
    require("AI_PROXY_URL", env.LLM_PROVIDER === "proxy" && !env.AI_PROXY_URL);
    require("AI_PROXY_TOKEN", env.LLM_PROVIDER === "proxy" && !env.AI_PROXY_TOKEN);
    const workers = env.LLM_PROVIDER === "workers-ai";
    require("CLOUDFLARE_ACCOUNT_ID", workers && !env.WORKERS_AI_URL && !env.CLOUDFLARE_ACCOUNT_ID);
    require("CLOUDFLARE_API_TOKEN", workers && !env.WORKERS_AI_TOKEN && !env.CLOUDFLARE_API_TOKEN);
    const multibaas = "set both MULTIBAAS_URL and MULTIBAAS_API_KEY, or neither";
    require("MULTIBAAS_API_KEY", Boolean(env.MULTIBAAS_URL) && !env.MULTIBAAS_API_KEY, multibaas);
    require("MULTIBAAS_URL", Boolean(env.MULTIBAAS_API_KEY) && !env.MULTIBAAS_URL, multibaas);
    const awaji = "set both MULTIBAAS_AWAJI_URL and MULTIBAAS_AWAJI_API_KEY, or neither";
    require("MULTIBAAS_AWAJI_API_KEY", Boolean(env.MULTIBAAS_AWAJI_URL) && !env.MULTIBAAS_AWAJI_API_KEY, awaji);
    require("MULTIBAAS_AWAJI_URL", Boolean(env.MULTIBAAS_AWAJI_API_KEY) && !env.MULTIBAAS_AWAJI_URL, awaji);
    const together = "set both World ID client values, or neither";
    require("WORLD_AGENTS_CLIENT_SECRET", Boolean(env.WORLD_AGENTS_CLIENT_ID) && !env.WORLD_AGENTS_CLIENT_SECRET, together);
    require("WORLD_AGENTS_CLIENT_ID", Boolean(env.WORLD_AGENTS_CLIENT_SECRET) && !env.WORLD_AGENTS_CLIENT_ID, together);
    for (const backend of env.TRIAGE_BACKENDS.split(",").map((b) => b.trim()).filter(Boolean)) {
      if (!["systemone", "proxy", "cloudflare"].includes(backend)) {
        ctx.addIssue({ code: "custom", path: ["TRIAGE_BACKENDS"], message: "use systemone, proxy and/or cloudflare" });
      }
    }
  });

export type Config = z.infer<typeof schema>;

/** The agent key must never reach this process: it lives in .env.signer, which only services/signer loads. */
export class KeyInAgentError extends Error {
  override readonly name = "KeyInAgentError";
  constructor() {
    super("AGENT_PRIVATE_KEY is in the agent's environment: move it to .env.signer, which only services/signer loads");
  }
}

/** Reads configuration from the environment. Errors name the invalid keys but never echo their values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.AGENT_PRIVATE_KEY !== undefined) throw new KeyInAgentError();
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new Error(`invalid or missing configuration: ${keys}`);
  }
  return parsed.data;
}

import { z } from "zod";

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/u, "must be a 32-byte hex key");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an address");
/** In a dotenv file an empty value means "not set". */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === "" ? undefined : v), schema.optional());
const flag = z.enum(["true", "false", "1", "0"]).transform((v) => v === "true" || v === "1");
const probability = z.coerce.number().min(0).max(1);

const schema = z
  .object({
    SEPOLIA_RPC_URL: z.url(),
    CHAIN_ID: z.coerce.number().int().positive().default(11155111),
    AGENT_PRIVATE_KEY: privateKey,
    REGISTRY_ADDRESS: address,
    VAULT_ADDRESS: address,
    TOKEN_ADDRESS: optional(address),
    VENDOR_T_NUMBERS: z.string().default("2011001234567"),
    AGENT_PORT: z.coerce.number().int().positive().default(8788),
    AGENT_HOST: z.string().default("127.0.0.1"), // 0.0.0.0 to serve the LAN (then set AGENT_API_TOKEN)
    AGENT_API_TOKEN: optional(z.string().min(16)), // if set, every POST needs Authorization: Bearer <token>
    APP_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),
    // System-1 triage
    TRIAGE_BACKENDS: z.string().default("systemone,proxy"), // fine-tuned Kev first, then Jev via the team proxy
    TRIAGE_REQUIRED: flag.default(true),
    TRIAGE_MIN_P_SAFE: probability.default(0.9),
    SYSTEMONE_URL: z.url().default("http://127.0.0.1:8102/v1/systemone"), // the fine-tuned payee-0.8b (kev.serve)
    SYSTEMONE_API_KEY: optional(z.string()),
    SYSTEMONE_MODEL: z.string().default("kev-latest"),
    CLOUDFLARE_ACCOUNT_ID: optional(z.string().regex(/^[0-9a-f]{32}$/u, "must be a 32-character account id")),
    CLOUDFLARE_API_TOKEN: optional(z.string()),
    // The team's Cloudflare Worker (workers/ai-proxy): /v1/systemone (Jev) and /v1/chat (Workers AI Llama)
    AI_PROXY_URL: optional(z.url()),
    AI_PROXY_TOKEN: optional(z.string()),
    // System-2 LLM
    LLM_PROVIDER: z.enum(["proxy", "anthropic", "workers-ai", "none"]).default("proxy"),
    ANTHROPIC_API_KEY: optional(z.string()),
    ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
    WORKERS_AI_MODEL: z.string().default("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
    WORKERS_AI_URL: optional(z.url()),
    WORKERS_AI_TOKEN: optional(z.string()),
    // Intercepta screening
    INTERCEPTA_API_KEY: optional(z.string()),
    INTERCEPTA_CACHE_PATH: z.string().default("../../data/agent/intercepta-cache.json"),
    INTERCEPTA_MAX_CALLS: z.coerce.number().int().nonnegative().default(900),
    INTERCEPTA_TOXIC_THRESHOLD: z.coerce.number().min(0).max(100).default(50),
  })
  .superRefine((env, ctx) => {
    const require = (key: string, when: boolean) => {
      if (when) ctx.addIssue({ code: "custom", path: [key], message: "required by the selected provider" });
    };
    require("ANTHROPIC_API_KEY", env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY);
    require("AI_PROXY_URL", env.LLM_PROVIDER === "proxy" && !env.AI_PROXY_URL);
    require("AI_PROXY_TOKEN", env.LLM_PROVIDER === "proxy" && !env.AI_PROXY_TOKEN);
    const workers = env.LLM_PROVIDER === "workers-ai";
    require("CLOUDFLARE_ACCOUNT_ID", workers && !env.WORKERS_AI_URL && !env.CLOUDFLARE_ACCOUNT_ID);
    require("CLOUDFLARE_API_TOKEN", workers && !env.WORKERS_AI_TOKEN && !env.CLOUDFLARE_API_TOKEN);
    for (const backend of env.TRIAGE_BACKENDS.split(",").map((b) => b.trim()).filter(Boolean)) {
      if (!["systemone", "proxy", "cloudflare"].includes(backend)) {
        ctx.addIssue({ code: "custom", path: ["TRIAGE_BACKENDS"], message: "use systemone, proxy and/or cloudflare" });
      }
    }
  });

export type Config = z.infer<typeof schema>;

/** Reads configuration from the environment. Errors name the invalid keys but never echo their values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ");
    throw new Error(`invalid or missing configuration: ${keys}`);
  }
  return parsed.data;
}

import { z } from "zod";

/**
 * The signer's configuration. It reads the repo-root .env for the shared values (RPC, chain, vault, World ID
 * issuer) and .env.signer for its two secrets: AGENT_PRIVATE_KEY and SIGNER_TOKEN. Values are never echoed, even
 * in errors.
 */

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an address");

const schema = z.object({
  AGENT_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/u, "must be 0x followed by 64 hex characters"),
  SIGNER_TOKEN: z.string().min(32, "must be at least 32 characters (openssl rand -hex 32)"),
  SEPOLIA_RPC_URL: z.url(),
  CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  VAULT_ADDRESS: address,
  SIGNER_HOST: z.enum(["127.0.0.1", "::1"]).default("127.0.0.1"), // loopback only: the agent is its one caller
  SIGNER_PORT: z.coerce.number().int().min(1).max(65535).default(8796),
  SIGNER_HUMAN_ABOVE_YEN: z.coerce.number().int().positive().default(50_000), // above this, a human's approval
  SIGNER_APPROVAL_MAX_AGE_S: z.coerce.number().int().positive().default(600), // how fresh that approval must be
  WORLD_AGENTS_ISSUER: z.string().optional(), // when set, an approval must come from this issuer
  WORLD_AGENTS_CLIENT_ID: z.string().optional(), // and be for this client
});

export type Config = z.infer<typeof schema>;

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (parsed.success) return parsed.data;
  const problems = parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`);
  throw new ConfigError(problems.join("; "));
}

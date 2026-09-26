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
  // The ENS MandateGate in front of the vault. Used only while the vault's agent is this gate; unset, or with the
  // vault's agent set back to the key, the signer pays the vault directly.
  MANDATE_GATE_ADDRESS: address.optional(),
  SIGNER_HOST: z.enum(["127.0.0.1", "::1"]).default("127.0.0.1"), // loopback only: the agent is its one caller
  SIGNER_PORT: z.coerce.number().int().min(1).max(65535).default(8796),
  SIGNER_HUMAN_ABOVE_YEN: z.coerce.number().int().positive().default(150_000), // above this, a human's approval
  SIGNER_APPROVAL_MAX_AGE_S: z.coerce.number().int().positive().default(600), // how fresh that approval must be
  WORLD_AGENTS_ISSUER: z.string().optional(), // when set, an approval must come from this issuer
  WORLD_AGENTS_CLIENT_ID: z.string().optional(), // and be for this client
  // Phase 2 (1): the signer verifies an approval's signature, approver and single use itself. 0: Phase 1, claims only.
  SIGNER_VERIFY_APPROVAL: z.enum(["0", "1"]).default("0"),
  SIGNER_APPROVERS: z.string().default(""), // Phase 2, set in .env.signer: when set, the only approvers
  WORLD_AGENTS_APPROVERS: z.string().default(""), // otherwise the pinned approvers, as the agent reads them
  WORLD_AGENTS_APPROVERS_PATH: z.string().default("../../data/agent/approvers.json"), // and the agent's enrolled ones
});

/** https, or http on loopback for a local mock IdP, which proves nothing, so only on the local chain. */
const acceptableIssuer = (value: string, chainId: number) => {
  const { protocol, hostname } = new URL(value);
  return protocol === "https:" || (chainId === 31337 && protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(hostname));
};

export type Config = z.infer<typeof schema>;

export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`);
    throw new ConfigError(problems.join("; "));
  }
  const config = parsed.data;
  if (config.SIGNER_VERIFY_APPROVAL === "1") {
    if (!config.WORLD_AGENTS_ISSUER || !config.WORLD_AGENTS_CLIENT_ID) {
      throw new ConfigError("SIGNER_VERIFY_APPROVAL=1 needs WORLD_AGENTS_ISSUER and WORLD_AGENTS_CLIENT_ID");
    }
    if (!URL.canParse(config.WORLD_AGENTS_ISSUER) || !acceptableIssuer(config.WORLD_AGENTS_ISSUER, config.CHAIN_ID)) {
      throw new ConfigError("WORLD_AGENTS_ISSUER: must be https (http only on loopback, for a local mock IdP on chain 31337)");
    }
  }
  return config;
}

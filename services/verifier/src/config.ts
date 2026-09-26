import { z } from "zod";

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/u, "must be a 32-byte hex key");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an address");

const schema = z.object({
  SEPOLIA_RPC_URL: z.url(),
  CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  REGISTRY_ADDRESS: address,
  ATTESTER_PRIVATE_KEY: privateKey,
  WORLD_APP_ID: z.string().startsWith("app_"),
  WORLD_RP_ID: z.string().startsWith("rp_"),
  WORLD_RP_SIGNING_KEY: privateKey,
  WORLD_ENVIRONMENT: z.enum(["production", "staging", "sandbox"]).default("staging"),
  // Credentials an officer may prove with: proof_of_human (Orb), selfie (Selfie Check, phone only), comma-separated.
  WORLD_OFFICER_CREDENTIALS: z
    .string()
    .default("proof_of_human")
    .refine((value) => value.split(",").every((c) => ["proof_of_human", "selfie"].includes(c.trim())), {
      message: "must list proof_of_human and/or selfie",
    }),
  NTA_DB_PATH: z.string().default("../../data/nta/corporations.sqlite"),
  VERIFIER_DB_PATH: z.string().default("../../data/verifier.sqlite"),
  VERIFIER_PORT: z.coerce.number().int().positive().default(8787),
  // The verifier holds the attester key, so it only listens locally unless told otherwise.
  VERIFIER_HOST: z.string().default("127.0.0.1"),
  APP_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),
  // "1" lets fictional demo companies (registry office 9999 only) register without an NTA match or domain proof.
  VERIFIER_FIXTURES: z.enum(["0", "1"]).default("0"),
  // Anti-squatting: hours a non-fixture registration waits, listed at GET /registrations/pending, before the attester
  // submits it. 0 submits at once (the demo); use 24-72 in production.
  VERIFIER_PENDING_HOURS: z.coerce.number().min(0).max(24 * 30).default(0),
  // An unsubmitted registration counts as open for this long; after that it expires and can't be submitted.
  VERIFIER_OPEN_REGISTRATION_HOURS: z.coerce.number().positive().max(24 * 30).default(24),
  // Per-client-IP limits per hour (0 turns one off): new registrations, disputes filed, objections.
  VERIFIER_RATE_REGISTRATIONS_PER_HOUR: z.coerce.number().int().min(0).default(10),
  VERIFIER_RATE_DISPUTES_PER_HOUR: z.coerce.number().int().min(0).default(3),
  VERIFIER_RATE_OBJECTIONS_PER_HOUR: z.coerce.number().int().min(0).default(10),
  // "1" only behind a reverse proxy you run: the client IP then comes from CF-Connecting-IP or X-Forwarded-For.
  VERIFIER_TRUST_PROXY: z.enum(["0", "1"]).default("0"),
});

export type Config = z.infer<typeof schema>;

/** Reads configuration from the environment. Errors name the invalid keys but never echo their values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`invalid or missing configuration: ${keys}`);
  }
  return parsed.data;
}

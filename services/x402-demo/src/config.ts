import { z } from "zod";

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/u, "must be a 32-byte hex key");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an address");

const schema = z.object({
  SEPOLIA_RPC_URL: z.url(),
  REGISTRY_ADDRESS: address,
  TOKEN_ADDRESS: address,
  DEMO_MERCHANT_T_NUMBER: z.string().regex(/^T?\d{13}$/u).default("T8999900000001"),
  DEMO_MERCHANT_PAYOUT: address,
  DEMO_SCAMMER: address,
  // Merchants that declare no Meigi payee. The clean one defaults to DEMO_MERCHANT_PAYOUT so test funds stay
  // ours; the flagged one is the OFAC-listed Ronin bridge exploiter (Lazarus Group), known to screening APIs.
  DEMO_UNVERIFIED_PAYTO: address.optional(),
  DEMO_FLAGGED_PAYTO: address.default("0x098B716B8Aaf21512996dC57EB0615e2383E2f96"),
  DEMO_BUYER_PRIVATE_KEY: privateKey,
  FACILITATOR_PRIVATE_KEY: privateKey,
  INTERCEPTA_API_KEY: z.string().min(8).optional(),
  X402_DEMO_PORT: z.coerce.number().int().positive().default(8790),
  // The demo spends testnet gas on every honest purchase, so it only listens locally unless told otherwise.
  X402_DEMO_HOST: z.string().default("127.0.0.1"),
  APP_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),
});

export type Config = z.infer<typeof schema>;

export const NETWORK = "eip155:11155111" as const;
/** 10 mJPYC per API call (18 decimals). */
export const PRICE_ATOMIC = "10000000000000000000";
/** The most the buyer pays a merchant that declares no Meigi payee, even after screening clears it: 50 mJPYC. */
export const UNVERIFIED_MAX_ATOMIC = 50n * 10n ** 18n;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`invalid or missing configuration: ${keys}`);
  }
  return parsed.data;
}

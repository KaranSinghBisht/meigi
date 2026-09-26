import { z } from "zod";

const privateKey = z.string().regex(/^0x[0-9a-fA-F]{64}$/u, "must be a 32-byte hex key");
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u, "must be an address");
/** An optional setting where an empty value (`KEY=`) means unset, so it can be switched off from the shell. */
const optional = <T extends z.ZodType>(type: T) => z.preprocess((v) => (v === "" ? undefined : v), type.optional());

const schema = z.object({
  // Where payments settle: "sepolia" (mock JPYC, plus ENS) or "awaji" (Mizuhiki's own MJPY on Awaji; no ENS there).
  X402_CHAIN: z.enum(["sepolia", "awaji"]).default("sepolia"),
  SEPOLIA_RPC_URL: z.url(),
  REGISTRY_ADDRESS: address,
  TOKEN_ADDRESS: address,
  DEMO_MERCHANT_T_NUMBER: z.string().regex(/^T?\d{13}$/u).default("T8999900000001"),
  DEMO_MERCHANT_PAYOUT: address,
  DEMO_MINATO_T_NUMBER: z.string().regex(/^T?\d{13}$/u).default("T6999900000003"),
  DEMO_MINATO_PAYOUT: address,
  DEMO_SCAMMER: address,
  // Merchants that declare no Meigi payee. The clean one defaults to DEMO_MERCHANT_PAYOUT so test funds stay
  // ours; the flagged one is the OFAC-listed Ronin bridge exploiter (Lazarus Group), known to screening APIs.
  DEMO_UNVERIFIED_PAYTO: address.optional(),
  DEMO_FLAGGED_PAYTO: address.default("0x098B716B8Aaf21512996dC57EB0615e2383E2f96"),
  DEMO_BUYER_PRIVATE_KEY: privateKey,
  FACILITATOR_PRIVATE_KEY: privateKey,
  INTERCEPTA_API_KEY: optional(z.string().min(8)),
  // Awaji mode. The registry is Meigi's Awaji deployment (contracts/deployments/6497.json); the token is MJPY.
  AWAJI_RPC_URL: z.url().default("https://rpc.awaji.mizuhiki.io"),
  AWAJI_REGISTRY_ADDRESS: address.default("0x4dbF8b5C3da46996C156AC3d17B16a230387b7C4"),
  AWAJI_TOKEN_ADDRESS: address.default("0x78f5f0Ac4EF201618b97638ded959b155c4f4B04"),
  // Minato GPU Cloud's payout as registered on Awaji (required in Awaji mode; kept in .env.awaji with its key).
  AWAJI_MINATO_PAYOUT: optional(address),
  // Mizuhiki's hosted facilitator. Unset, the in-process facilitator settles on Awaji with FACILITATOR_PRIVATE_KEY.
  AWAJI_FACILITATOR_URL: optional(z.url()),
  X402_DEMO_PORT: z.coerce.number().int().positive().default(8790),
  // The demo spends testnet gas on every honest purchase, so it only listens locally unless told otherwise.
  X402_DEMO_HOST: z.string().default("127.0.0.1"),
  APP_ORIGINS: z.string().default("http://localhost:5173,http://localhost:4173"),
});

export type Config = z.infer<typeof schema>;

/** Prices in whole yen; see `yen()` in rail.ts for the token units. 10 per call: the undeclared-merchant tier. */
export const PRICE_YEN = 10;
/** Minato GPU Cloud: 30 per inference call, 15 per GPU-minute. */
export const GPU_INFERENCE_PRICE_YEN = 30;
export const GPU_MINUTE_PRICE_YEN = 15;
/** Fuji Data: 20 per dataset slice. */
export const DATASET_SLICE_PRICE_YEN = 20;
/** The buyer's hard per-payment ceiling: at least the priciest declared route (GPU inference). */
export const MAX_PRICE_YEN = GPU_INFERENCE_PRICE_YEN;
/** The most the buyer pays a merchant that declares no Meigi payee, even after screening clears it. */
export const UNVERIFIED_MAX_YEN = 50;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema
    .refine((c) => c.X402_CHAIN !== "awaji" || c.AWAJI_MINATO_PAYOUT !== undefined, {
      message: "Awaji mode needs Minato's registered Awaji payout",
      path: ["AWAJI_MINATO_PAYOUT"],
    })
    .safeParse(env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`invalid or missing configuration: ${keys}`);
  }
  return parsed.data;
}

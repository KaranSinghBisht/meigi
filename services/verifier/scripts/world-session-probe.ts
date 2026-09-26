/**
 * End-to-end probe of the World ID 4.0 session flow against the real World APIs.
 *   create:        tsx --env-file=../../.env scripts/world-session-probe.ts create
 *   prove <id>:    tsx --env-file=../../.env scripts/world-session-probe.ts prove session_…
 * Prints the connector URI (and, best-effort, a QR PNG of it) to open in the World ID simulator (staging),
 * World App, or the World ID app, waits for the proof, then runs it through the verifier's own signal check and
 * World's verify endpoint.
 *
 * PROBE_WINDOW_SEC (default 300 = 5 min): how long both the signed request and our own poll stay valid. Raise
 * it (e.g. 600 for 10 min) when the person scanning needs more room than a quick automated check does - a
 * request that's expired server-side fails no matter how long we keep polling, so this covers both.
 * PROBE_OUT: where the raw IDKit result is saved on success. Defaults under the repo's git-ignored `data/`
 * (never the repo itself) - this is enough for the offline `check-credential-payload.ts` check, and nothing
 * more; there's no reason to also copy it anywhere committed.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// IDKit loads its WASM with fetch(); Node's fetch can't read file: URLs, so serve those from disk.
const nodeFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
  if (url.protocol !== "file:") return nodeFetch(input, init);
  return new Response(readFileSync(fileURLToPath(url)), { headers: { "content-type": "application/wasm" } });
}) as typeof fetch;
import { CredentialRequest, IDKit } from "@worldcoin/idkit-core";
import { signRequest } from "@worldcoin/idkit-core/signing";
import QRCode from "qrcode";
import { loadConfig } from "../src/config.js";
import { requireSignal, verifySessionProof, type WorldEnvironment } from "../src/world/session.js";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../../");
const OUT_DIR = path.resolve(REPO_ROOT, "data/world-probe");
mkdirSync(OUT_DIR, { recursive: true }); // data/ is git-ignored repo-wide; nothing here ever reaches a commit.

const config = loadConfig();
const [mode, sessionId] = process.argv.slice(2);
const signal = `meigi:v1:probe:${randomBytes(6).toString("hex")}`;
const windowSec = Number(process.env.PROBE_WINDOW_SEC ?? 300);

// Signed directly (not via session.ts's createRpContext) so this throwaway script's longer window never touches
// the ttl the live server uses - session.ts is exactly what f859ed8 changed and is still unvalidated.
const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: config.WORLD_RP_SIGNING_KEY, ttl: windowSec });
const sessionConfig = {
  app_id: config.WORLD_APP_ID as `app_${string}`,
  rp_context: { rp_id: config.WORLD_RP_ID, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig },
  environment: config.WORLD_ENVIRONMENT as WorldEnvironment,
  action_description: "Meigi officer check (probe)",
};

const builder =
  mode === "prove" && sessionId?.startsWith("session_")
    ? IDKit.proveSession(sessionId as `session_${string}`, sessionConfig)
    : IDKit.createSession(sessionConfig);
// IDKit 4.3 session flows reject presets; they take a constraint tree.
const request = await builder.constraints(CredentialRequest("proof_of_human", { signal }));
process.stdout.write(`CONNECTOR_URI ${request.connectorURI}\n`);
process.stdout.write(`WINDOW ${windowSec}s (request + poll)\n`);

const qrPath = path.join(OUT_DIR, "qr.png");
try {
  await QRCode.toFile(qrPath, request.connectorURI, { width: 512 });
  process.stdout.write(`QR_PNG ${qrPath}\n`);
} catch (error) {
  process.stdout.write(`QR_PNG_FAILED ${error instanceof Error ? error.message : String(error)} - use the URI above.\n`);
}

const completion = await request.pollUntilCompletion({ timeout: windowSec * 1000 });
if (!completion.success) {
  process.stdout.write(`IDKIT_FAILED ${JSON.stringify(completion)}\n`);
  throw new Error("IDKit request did not complete");
}
const outPath = process.env.PROBE_OUT ?? path.join(OUT_DIR, "result.json");
writeFileSync(outPath, JSON.stringify(completion.result, null, 2));
process.stdout.write(`SAVED ${outPath}\n`);
requireSignal(completion.result, signal);
const verified = await verifySessionProof(config.WORLD_RP_ID, completion.result, config.WORLD_ENVIRONMENT);
process.stdout.write(`VERIFIED session=${verified.sessionId.slice(0, 24)}… officerId=${verified.officerId}\n`);

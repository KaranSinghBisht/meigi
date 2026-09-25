/**
 * End-to-end probe of the World ID 4.0 session flow against the real World APIs.
 *   create:        tsx --env-file=../../.env scripts/world-session-probe.ts create
 *   prove <id>:    tsx --env-file=../../.env scripts/world-session-probe.ts prove session_…
 * Prints the connector URI to open in the World ID simulator (staging) or World App, waits for the proof,
 * then runs it through the verifier's own signal check and World's verify endpoint.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// IDKit loads its WASM with fetch(); Node's fetch can't read file: URLs, so serve those from disk.
const nodeFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = input instanceof URL ? input : new URL(typeof input === "string" ? input : input.url);
  if (url.protocol !== "file:") return nodeFetch(input, init);
  return new Response(readFileSync(fileURLToPath(url)), { headers: { "content-type": "application/wasm" } });
}) as typeof fetch;
import { CredentialRequest, IDKit } from "@worldcoin/idkit-core";
import { loadConfig } from "../src/config.js";
import { createRpContext, requireSignal, verifySessionProof, type WorldEnvironment } from "../src/world/session.js";

const config = loadConfig();
const [mode, sessionId] = process.argv.slice(2);
const signal = `meigi:v1:probe:${randomBytes(6).toString("hex")}`;
const rp = createRpContext(config.WORLD_RP_SIGNING_KEY);
const sessionConfig = {
  app_id: config.WORLD_APP_ID as `app_${string}`,
  rp_context: { rp_id: config.WORLD_RP_ID, nonce: rp.nonce, created_at: rp.created_at, expires_at: rp.expires_at, signature: rp.sig },
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

const completion = await request.pollUntilCompletion({ timeout: 300_000 });
if (!completion.success) {
  process.stdout.write(`IDKIT_FAILED ${JSON.stringify(completion)}\n`);
  throw new Error("IDKit request did not complete");
}
writeFileSync(process.env.PROBE_OUT ?? "world-probe-result.json", JSON.stringify(completion.result, null, 2));
requireSignal(completion.result, signal);
const verified = await verifySessionProof(config.WORLD_RP_ID, completion.result, config.WORLD_ENVIRONMENT);
process.stdout.write(`VERIFIED session=${verified.sessionId.slice(0, 24)}… officerId=${verified.officerId}\n`);

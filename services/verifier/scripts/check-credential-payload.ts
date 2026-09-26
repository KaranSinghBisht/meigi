/**
 * Offline check: does a saved (real or captured) IDKit session result pass `requireCredential` as currently
 * written? For validating f859ed8 (issuer_schema_id pinning) against a real payload before it ever goes live -
 * see docs/world-debrief.md and the commit itself. Never calls World or touches the running verifier; it only
 * reads a JSON file and calls the same function server.ts calls.
 *
 *   tsx --env-file=../../.env scripts/check-credential-payload.ts <result.json> [allowed,credentials]
 *
 * With no allow-list argument, reads WORLD_OFFICER_CREDENTIALS from config - the same set the live server checks
 * against. Prints each response's identifier and issuer_schema_id verbatim, with their JS type, before the
 * pass/fail verdict, so a real-proof failure shows exactly what shape surprised us.
 */
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.js";
import { requireCredential, WorldVerificationError } from "../src/world/session.js";

const [path, allowedArg] = process.argv.slice(2);
if (!path) {
  process.stderr.write("usage: check-credential-payload.ts <result.json> [allowed,credentials]\n");
  process.exit(2);
}

const allowed = new Set((allowedArg ?? loadConfig().WORLD_OFFICER_CREDENTIALS).split(",").map((s) => s.trim()));
const result: unknown = JSON.parse(readFileSync(path, "utf8"));

const responses = Array.isArray((result as { responses?: unknown })?.responses)
  ? ((result as { responses: unknown[] }).responses as unknown[])
  : [];

process.stdout.write(`Payload: ${path}\n`);
process.stdout.write(`Allowed credentials (from ${allowedArg ? "argument" : "WORLD_OFFICER_CREDENTIALS"}): ${[...allowed].join(", ")}\n`);
process.stdout.write(`responses[]: ${responses.length} entr${responses.length === 1 ? "y" : "ies"}\n`);
for (const [i, response] of responses.entries()) {
  const identifier = (response as Record<string, unknown> | null)?.identifier;
  const issuerSchemaId = (response as Record<string, unknown> | null)?.issuer_schema_id;
  process.stdout.write(
    `  [${i}] identifier = ${JSON.stringify(identifier)}  (js type: ${typeof identifier})\n` +
      `      issuer_schema_id = ${JSON.stringify(issuerSchemaId)}  (js type: ${typeof issuerSchemaId})\n`,
  );
}

try {
  requireCredential(result, allowed);
  process.stdout.write("PASS - requireCredential accepts this payload as-is.\n");
} catch (error) {
  const code = error instanceof WorldVerificationError ? error.code : "unexpected_error";
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`FAIL - requireCredential rejects this payload: ${code} (${message})\n`);
  process.exitCode = 1;
}

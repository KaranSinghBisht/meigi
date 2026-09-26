import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { verifyDomainProof } from "./domain/proof.js";
import { gleifRegistry } from "./lei/lei.js";
import { openCorporationIndex } from "./nta/corporations.js";
import { createChainPort } from "./registry/chain.js";
import { openStore } from "./store/db.js";
import {
  createRpContext,
  requireCredential,
  requireSignal,
  toIdkitRpContext,
  verifySessionProof,
} from "./world/session.js";

const config = loadConfig();
const officerCredentials = new Set(config.WORLD_OFFICER_CREDENTIALS.split(",").map((c) => c.trim()));

const app = createApp({
  corporations: openCorporationIndex(config.NTA_DB_PATH),
  store: openStore(config.VERIFIER_DB_PATH),
  chain: createChainPort(config),
  world: {
    rpContext: () => toIdkitRpContext(config.WORLD_RP_ID, createRpContext(config.WORLD_RP_SIGNING_KEY)),
    async verify(result, signal) {
      requireCredential(result, officerCredentials);
      if (signal) requireSignal(result, signal);
      return verifySessionProof(config.WORLD_RP_ID, result, config.WORLD_ENVIRONMENT);
    },
  },
  domain: { verify: (input) => verifyDomainProof(input) },
  lei: gleifRegistry(),
  origins: config.APP_ORIGINS.split(",").map((origin) => origin.trim()),
  fixtures: config.VERIFIER_FIXTURES === "1",
});

serve({ fetch: app.fetch, port: config.VERIFIER_PORT, hostname: config.VERIFIER_HOST }, (info) => {
  process.stdout.write(`meigi verifier listening on http://localhost:${info.port}\n`);
});

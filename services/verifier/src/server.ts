import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { verifyDomainProof } from "./domain/proof.js";
import { openCorporationIndex } from "./nta/corporations.js";
import { createChainPort } from "./registry/chain.js";
import { openStore } from "./store/db.js";
import { createRpContext, requireSignal, toIdkitRpContext, verifySessionProof } from "./world/session.js";

const config = loadConfig();

const app = createApp({
  corporations: openCorporationIndex(config.NTA_DB_PATH),
  store: openStore(config.VERIFIER_DB_PATH),
  chain: createChainPort(config),
  world: {
    rpContext: () => toIdkitRpContext(config.WORLD_RP_ID, createRpContext(config.WORLD_RP_SIGNING_KEY)),
    async verify(result, signal) {
      if (signal) requireSignal(result, signal);
      return verifySessionProof(config.WORLD_RP_ID, result, config.WORLD_ENVIRONMENT);
    },
  },
  domain: { verify: (input) => verifyDomainProof(input) },
  origins: config.APP_ORIGINS.split(",").map((origin) => origin.trim()),
});

serve({ fetch: app.fetch, port: config.VERIFIER_PORT, hostname: config.VERIFIER_HOST }, (info) => {
  process.stdout.write(`meigi verifier listening on http://localhost:${info.port}\n`);
});

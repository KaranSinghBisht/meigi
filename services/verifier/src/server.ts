import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { AppDeps } from "./deps.js";
import { verifyDomainProof } from "./domain/proof.js";
import { gleifRegistry } from "./lei/lei.js";
import { clientIpOf } from "./limits/client-ip.js";
import { openCorporationIndex } from "./nta/corporations.js";
import { startPendingScheduler } from "./pending/window.js";
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

const deps: AppDeps = {
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
  policy: {
    pendingHours: config.VERIFIER_PENDING_HOURS,
    openRegistrationHours: config.VERIFIER_OPEN_REGISTRATION_HOURS,
    ratePerHour: {
      registrations: config.VERIFIER_RATE_REGISTRATIONS_PER_HOUR,
      disputes: config.VERIFIER_RATE_DISPUTES_PER_HOUR,
      objections: config.VERIFIER_RATE_OBJECTIONS_PER_HOUR,
      domain: config.VERIFIER_RATE_DOMAIN_PER_HOUR,
      nta: config.VERIFIER_RATE_NTA_PER_HOUR,
      payees: config.VERIFIER_RATE_PAYEES_PER_HOUR,
      lei: config.VERIFIER_RATE_LEI_PER_HOUR,
      rpContext: config.VERIFIER_RATE_RP_CONTEXT_PER_HOUR,
      officers: config.VERIFIER_RATE_OFFICERS_PER_HOUR,
      intents: config.VERIFIER_RATE_INTENTS_PER_HOUR,
    },
  },
  clientIp: (c) => clientIpOf(c, config.VERIFIER_TRUST_PROXY === "1"),
};
const app = createApp(deps);
startPendingScheduler(deps); // submits queued registrations once their public window has passed

serve({ fetch: app.fetch, port: config.VERIFIER_PORT, hostname: config.VERIFIER_HOST }, (info) => {
  process.stdout.write(`meigi verifier listening on http://localhost:${info.port}\n`);
});

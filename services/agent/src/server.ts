import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { ConfigMismatchError } from "./chain/reader.js";
import { loadConfig } from "./config.js";
import { buildDeps } from "./wiring.js";

const log = (line: string) => process.stderr.write(`[agent] ${line}\n`);

const config = loadConfig();
const { deps, init } = buildDeps(config);

try {
  await init(); // reads the vault's registry and token, and checks them against the configuration
} catch (error) {
  if (error instanceof ConfigMismatchError) {
    log(`refusing to start: ${error.message}`);
    process.exit(1);
  }
  log(`chain not reachable yet (${error instanceof Error ? error.name : "error"}); will retry on first request`);
}

const app = createApp(deps);
serve({ fetch: app.fetch, port: config.AGENT_PORT, hostname: config.AGENT_HOST }, (info) => {
  const { chainId, llm, triage, screening, humanApproval } = deps.info;
  const auth = deps.apiToken ? "token required" : "no token";
  const approval = humanApproval ? `human approval via ${config.WORLD_AGENTS_ISSUER}` : "human approval off";
  log(`meigi agent listening on http://${config.AGENT_HOST}:${info.port} (chain ${chainId}, llm ${llm}, triage ${triage.join("+") || "none"}, screening ${screening ? "on" : "off"}, ${approval}, ${auth})`);
  if (humanApproval && !config.WORLD_AGENTS_ISSUER.startsWith("https://")) log("WORLD_AGENTS_ISSUER is a local mock IdP: approvals prove nothing");
});

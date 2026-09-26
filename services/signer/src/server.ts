import { serve } from "@hono/node-server";
import { ConfigError, loadConfig } from "./config.js";
import { RoleError, startSigner } from "./start.js";

const log = (line: string) => process.stderr.write(`[signer] ${line}\n`);

let started;
try {
  const config = loadConfig();
  started = { config, signer: await startSigner(config) };
} catch (error) {
  if (error instanceof ConfigError || error instanceof RoleError) {
    log(`refusing to start: ${error.message}`);
    process.exit(1);
  }
  log(`refusing to start: the chain could not be read (${error instanceof Error ? error.name : "error"})`);
  process.exit(1);
}

const { config, signer } = started;
serve({ fetch: signer.app.fetch, port: config.SIGNER_PORT, hostname: config.SIGNER_HOST }, (info) => {
  log(`meigi signer listening on http://${config.SIGNER_HOST}:${info.port} (chain ${config.CHAIN_ID}, agent ${signer.agent}, human approval above ¥${config.SIGNER_HUMAN_ABOVE_YEN.toLocaleString("en-US")})`);
});

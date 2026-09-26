import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMultiBaas } from "../src/multibaas/client.js";
import { indexingStatus, setupMultiBaas, type Deployment } from "../src/multibaas/setup.js";

/**
 * `pnpm --filter @meigi/agent multibaas:setup`: points a MultiBaas deployment (Curvegrid) at Meigi's Sepolia
 * contracts: ABIs, address aliases, event indexing from the v2 block, and the saved event queries. Safe to re-run.
 * Reads MULTIBAAS_URL and MULTIBAAS_API_KEY from the repo-root .env; prints neither.
 */

const out = (line: string) => process.stdout.write(`${line}\n`);
const url = process.env.MULTIBAAS_URL;
const apiKey = process.env.MULTIBAAS_API_KEY;
if (!url || !apiKey) {
  process.stderr.write("[multibaas] set MULTIBAAS_URL and MULTIBAAS_API_KEY in the repo-root .env first\n");
  process.exit(1);
}

const deploymentFile = fileURLToPath(new URL("../../../contracts/deployments/11155111.json", import.meta.url));
const deployment = JSON.parse(readFileSync(deploymentFile, "utf8")) as Deployment;
const mb = createMultiBaas({ url, apiKey, timeoutMs: 30_000 });

try {
  await setupMultiBaas(mb, deployment, out);
  for (const line of await indexingStatus(mb)) out(line);
  out("done: GET /payments and GET /invoices/:id/settlement now read MultiBaas when the agent restarts");
} catch (error) {
  process.stderr.write(`[multibaas] setup stopped: ${error instanceof Error ? error.message : "error"}\n`);
  process.exit(1);
}

import { fileURLToPath } from "node:url";
import { createMultiBaas, MultiBaasUnavailable } from "../src/multibaas/client.js";
import { loadDeployment } from "../src/multibaas/deployment.js";
import { indexingStatus, prepareLibrary, setupMultiBaas } from "../src/multibaas/setup.js";

/**
 * `pnpm --filter @meigi/agent multibaas:setup [--awaji] [--library-only] [--from-block N]`: points a MultiBaas
 * deployment (Curvegrid) at Meigi's contracts on the chain it serves: ABIs, address aliases, event indexing from the
 * deploy block, and the saved event queries. Safe to re-run.
 *   --awaji         the Mizuhiki Awaji deployment (MULTIBAAS_AWAJI_URL / _API_KEY) instead of MULTIBAAS_URL / _API_KEY
 *   --library-only  only the ABIs and queries, before the contracts exist
 *   --from-block N  where indexing starts (default: the first block of the forge broadcast; Sepolia: the v2 block)
 * Addresses come from contracts/deployments/<chain>.json. Reads the URL and key from the repo-root .env, prints neither.
 */

const out = (line: string) => process.stdout.write(`${line}\n`);
const args = process.argv.slice(2);
const prefix = args.includes("--awaji") ? "MULTIBAAS_AWAJI_" : "MULTIBAAS_";
const url = process.env[`${prefix}URL`];
const apiKey = process.env[`${prefix}API_KEY`];
if (!url || !apiKey) {
  process.stderr.write(`[multibaas] set ${prefix}URL and ${prefix}API_KEY in the repo-root .env first\n`);
  process.exit(1);
}

const contractsDir = fileURLToPath(new URL("../../../contracts", import.meta.url));
const mb = createMultiBaas({ url, apiKey, timeoutMs: 30_000 });

try {
  const chainId = await mb.chainId();
  if (args.includes("--library-only")) {
    out(`MultiBaas serves chain ${chainId}: adding Meigi's ABIs and event queries`);
    await prepareLibrary(mb, chainId, out);
  } else {
    const deployment = loadDeployment(contractsDir, chainId, fromBlockArg(args));
    out(`MultiBaas serves chain ${chainId}: linking Meigi's contracts from block ${deployment.startBlock}`);
    await setupMultiBaas(mb, deployment, out);
    for (const line of await indexingStatus(mb, deployment)) out(line);
  }
  out("done");
} catch (error) {
  const detail = error instanceof MultiBaasUnavailable && error.detail ? ` (${error.detail})` : "";
  process.stderr.write(`[multibaas] setup stopped: ${error instanceof Error ? error.message : "error"}${detail}\n`);
  process.exit(1);
}

function fromBlockArg(list: string[]): number | undefined {
  const at = list.indexOf("--from-block");
  if (at === -1) return undefined;
  const block = Number(list[at + 1]);
  if (!Number.isSafeInteger(block) || block < 0) throw new Error("--from-block takes a block number");
  return block;
}

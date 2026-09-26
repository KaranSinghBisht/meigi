import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { V2_START_BLOCK } from "./labels.js";
import type { Deployment } from "./setup.js";

/**
 * Which Meigi deployment a MultiBaas deployment should index, and from which block. The addresses come from
 * contracts/deployments/<chain>.json. Indexing starts at the first block of the forge broadcast that created them,
 * because a MultiBaas plan may read only a few blocks of past logs, and a later start would miss the first events.
 */

const SEPOLIA = 11155111;

const addresses = z.object({
  chainId: z.number().int(),
  registry: z.string(),
  vault: z.string().optional(), // a minimal deploy (e.g. Mizuhiki Awaji) may have no AgentVault
  router: z.string().optional(),
  token: z.string(),
});

const broadcast = z.object({
  transactions: z.array(z.object({ transactionType: z.string(), contractAddress: z.string().nullish() })),
  receipts: z.array(z.object({ blockNumber: z.string() })),
});

/** Reads the deployment for `chainId` under `contractsDir`; `fromBlock` overrides where indexing starts. */
export function loadDeployment(contractsDir: string, chainId: number, fromBlock?: number): Deployment {
  const file = `${contractsDir}/deployments/${chainId}.json`;
  if (!existsSync(file)) throw new Error(`no Meigi deployment for chain ${chainId} (contracts/deployments/${chainId}.json)`);
  const deployment = addresses.parse(JSON.parse(readFileSync(file, "utf8")));
  if (deployment.chainId !== chainId) throw new Error(`contracts/deployments/${chainId}.json is for chain ${deployment.chainId}`);
  if (fromBlock !== undefined) return { ...deployment, startBlock: fromBlock };
  if (chainId === SEPOLIA) return { ...deployment, startBlock: V2_START_BLOCK };
  const run = `${contractsDir}/broadcast/Deploy.s.sol/${chainId}/run-latest.json`;
  if (!existsSync(run)) {
    throw new Error(`chain ${chainId} has no broadcast yet (a dry run doesn't count): deploy first, or pass --from-block <deploy block>`);
  }
  return { ...deployment, startBlock: broadcastStart(broadcast.parse(JSON.parse(readFileSync(run, "utf8"))), deployment) };
}

/** The broadcast's first block, once it is confirmed to be the one that created these addresses. */
export function broadcastStart(run: z.infer<typeof broadcast>, deployment: z.infer<typeof addresses>): number {
  const created = new Set(run.transactions.flatMap((t) => (t.transactionType === "CREATE" && t.contractAddress ? [t.contractAddress.toLowerCase()] : [])));
  for (const at of [deployment.registry, deployment.vault ?? deployment.registry]) {
    if (!created.has(at.toLowerCase())) throw new Error(`the latest broadcast didn't create ${at}: pass --from-block <deploy block>`);
  }
  const blocks = run.receipts.map((r) => Number(BigInt(r.blockNumber)));
  if (blocks.length === 0) throw new Error("the latest broadcast has no receipts yet: wait for it to land");
  return Math.min(...blocks);
}

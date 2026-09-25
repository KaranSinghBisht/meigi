import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { agentEnv, startLocalStack } from "./stack/stack.js";

/**
 * `pnpm local:chain`: anvil + Meigi contracts (forge, Deploy.s.sol) + the demo vendors, registered, approved
 * and funded with MockJPYC. Writes services/agent/.env.local (git-ignored) for `pnpm dev:local`, then keeps
 * anvil running until Ctrl-C. Local only: it holds anvil's public dev keys and nothing else.
 */

const out = (line = "") => process.stdout.write(`${line}\n`);
const ENV_LOCAL = fileURLToPath(new URL("../.env.local", import.meta.url));

const stack = await startLocalStack({ port: Number(process.env.ANVIL_PORT ?? 8547) });
const env = agentEnv(stack);
writeFileSync(ENV_LOCAL, `# Written by scripts/local-chain.ts for a local anvil. Public dev keys only.\n${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`);

out(`anvil ${stack.anvil.url} (chain 31337)${stack.anvil.note ? ` — ${stack.anvil.note}` : ""}`);
out(`registry ${stack.deployment.registry}`);
out(`vault    ${stack.deployment.vault}`);
out(`token    ${stack.deployment.token} (MockJPYC, 5,000,000 minted into the vault)`);
out(`agent    ${stack.accounts.agent.address}`);
for (const vendor of stack.vendors) {
  out(`vendor   ${vendor.tNumber} ${vendor.legalName} → ${vendor.payout}${vendor.approve ? " (approved)" : " (registered, not approved)"}`);
}
out();
out(`wrote ${ENV_LOCAL}`);
out("next: pnpm dev:local   (in another terminal), then: pnpm demo");
out("Ctrl-C stops anvil.");

const shutdown = () => {
  stack.anvil.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => undefined, 1 << 30); // keep the process (and anvil) alive

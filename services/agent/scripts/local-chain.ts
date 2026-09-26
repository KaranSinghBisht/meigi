import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { agentEnv, signerEnv, startLocalStack } from "./stack/stack.js";

/**
 * `pnpm local:chain`: anvil + Meigi contracts (forge, Deploy.s.sol) + the demo vendors, registered, approved
 * and funded with MockJPYC. Writes two git-ignored env files, one per process, then keeps anvil running until
 * Ctrl-C:
 *   services/signer/.env.local  anvil's agent key and the shared token: `pnpm --filter @meigi/signer dev:local`
 *   services/agent/.env.local   no key: `pnpm dev:local`
 * Local only: anvil's public dev keys and a fresh token, nothing else. The token is never printed.
 */

const out = (line = "") => process.stdout.write(`${line}\n`);
const AGENT_ENV = fileURLToPath(new URL("../.env.local", import.meta.url));
const SIGNER_ENV = fileURLToPath(new URL("../../signer/.env.local", import.meta.url));
const SIGNER_PORT = Number(process.env.SIGNER_PORT ?? 8797); // the Sepolia signer uses 8796

const stack = await startLocalStack({ port: Number(process.env.ANVIL_PORT ?? 8547) });
const token = randomBytes(32).toString("hex");
const dotenv = (env: Record<string, string>) => `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n")}\n`;
writeFileSync(SIGNER_ENV, `# Written by scripts/local-chain.ts for a local anvil. Public dev keys only.\n${dotenv(signerEnv(stack, { port: SIGNER_PORT, token }))}`, { mode: 0o600 });
writeFileSync(AGENT_ENV, `# Written by scripts/local-chain.ts for a local anvil. No key: the signer holds it.\n${dotenv(agentEnv(stack, { url: `http://127.0.0.1:${SIGNER_PORT}`, token }))}`, { mode: 0o600 });

out(`anvil ${stack.anvil.url} (chain 31337)${stack.anvil.note ? ` — ${stack.anvil.note}` : ""}`);
out(`registry ${stack.deployment.registry}`);
out(`vault    ${stack.deployment.vault}`);
out(`token    ${stack.deployment.token} (MockJPYC, 5,000,000 minted into the vault)`);
out(`agent    ${stack.accounts.agent.address}`);
for (const vendor of stack.vendors) {
  out(`vendor   ${vendor.tNumber} ${vendor.legalName} → ${vendor.payout}${vendor.approve ? " (approved)" : " (registered, not approved)"}`);
}
out();
out(`wrote ${SIGNER_ENV} and ${AGENT_ENV}`);
out(`next: pnpm --filter @meigi/signer dev:local (signer on :${SIGNER_PORT}), pnpm dev:local, then: pnpm demo`);
out("Ctrl-C stops anvil.");

const shutdown = () => {
  stack.anvil.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => undefined, 1 << 30); // keep the process (and anvil) alive

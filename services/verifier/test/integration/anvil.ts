import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mnemonicToAccount } from "viem/accounts";
import { toHex, type Address, type Hex } from "viem";

/** anvil's well-known development mnemonic. These keys are public; never use them anywhere but a local chain. */
const ANVIL_MNEMONIC = "test test test test test test test test test test test junk";

export interface DevAccount {
  address: Address;
  key: Hex;
}

/** Separate roles, as the deploy script requires: governance, attester, vault owner, agent, business key. */
export function anvilAccounts() {
  const at = (addressIndex: number): DevAccount => {
    const account = mnemonicToAccount(ANVIL_MNEMONIC, { addressIndex });
    const key = account.getHdKey().privateKey;
    if (!key) throw new Error("could not derive an anvil key");
    return { address: account.address, key: toHex(key) };
  };
  return { deployer: at(0), attester: at(1), vaultOwner: at(2), agent: at(3), controller: at(4) };
}

export function hasFoundry(): boolean {
  return ["anvil", "forge"].every((bin) => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0);
}

export interface Anvil {
  url: string;
  port: number;
  note: string | null; // set when the preferred port was busy and another one was used
  stop(): void;
}

/** Starts a fresh anvil (chain id 31337). A busy preferred port is left alone: another free port is used. */
export async function startAnvil(preferredPort = 8547): Promise<Anvil> {
  const port = (await isPortFree(preferredPort)) ? preferredPort : await freePort();
  const child = spawn("anvil", ["--port", String(port), "--chain-id", "31337", "--silent"], { stdio: "ignore" });
  const exited = new Promise<never>((_, reject) => {
    child.once("error", (error) => reject(new Error(`could not start anvil: ${error.message}`)));
    child.once("exit", (code) => reject(new Error(`anvil exited with code ${code}`)));
  });
  const url = `http://127.0.0.1:${port}`;
  await Promise.race([waitForRpc(url, 15_000), exited]);
  const note = port === preferredPort ? null : `port ${preferredPort} is busy, so anvil runs on ${port}`;
  return { url, port, note, stop: () => void child.kill() };
}

async function waitForRpc(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (response.ok) return;
    } catch {
      // not listening yet: keep polling until the deadline
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`anvil did not answer at ${url} within ${timeoutMs / 1000}s`);
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (address && typeof address === "object" ? resolve(address.port) : reject(new Error("no free port"))));
    });
  });
}

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Address, Hex } from "viem";

const CONTRACTS = fileURLToPath(new URL("../../../../contracts/", import.meta.url));

export interface Deployment {
  chainId: number;
  registry: Address;
  resolver: Address;
  router: Address;
  token: Address;
  vault: Address;
}

export interface DeployOptions {
  rpcUrl: string;
  deployerKey: Hex;
  attester: Address;
  agent: Address;
  vaultOwner: Address;
  vendorDelay?: number; // seconds (Deploy.s.sol defaults to 1h)
  changeDelay?: number; // seconds (Deploy.s.sol defaults to 72h)
}

/**
 * Runs `forge script contracts/script/Deploy.s.sol` exactly as for Sepolia, but from a throwaway Foundry root:
 * build output, broadcast logs and deployments/<chainId>.json land in a temp dir, so the shared contracts/
 * tree (and anyone else compiling in it) is never touched. The deployer key goes through the environment.
 */
export async function deployWithForge(opts: DeployOptions): Promise<Deployment> {
  const root = mkdtempSync(join(tmpdir(), "meigi-forge-"));
  try {
    writeFileSync(join(root, "foundry.toml"), isolatedConfig(readFileSync(join(CONTRACTS, "foundry.toml"), "utf8")));
    mkdirSync(join(root, "deployments"));
    // A minimal environment, run from the temp root: forge auto-loads `.env` from its working directory and
    // parents, and the repo's .env holds the Sepolia TOKEN_ADDRESS, which Deploy.s.sol would otherwise reuse.
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      DEPLOYER_PRIVATE_KEY: opts.deployerKey,
      ATTESTER_ADDRESS: opts.attester,
      AGENT_ADDRESS: opts.agent,
      VAULT_OWNER_ADDRESS: opts.vaultOwner,
      VENDOR_DELAY: String(opts.vendorDelay ?? 3600),
      CHANGE_DELAY: String(opts.changeDelay ?? 72 * 3600),
    };
    const script = `${join(CONTRACTS, "script", "Deploy.s.sol")}:Deploy`;
    await run("forge", ["script", script, "--root", root, "--rpc-url", opts.rpcUrl, "--broadcast"], env, root);
    const [file] = readdirSync(join(root, "deployments"));
    if (!file) throw new Error("forge finished without writing a deployment record");
    return JSON.parse(readFileSync(join(root, "deployments", file), "utf8")) as Deployment;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** contracts/foundry.toml with its relative paths made absolute, so it works from another root. */
export function isolatedConfig(toml: string): string {
  const abs = (path: string) => join(CONTRACTS, path);
  const patched = toml
    .replace(/^src\s*=\s*"([^"]+)"/mu, (_, p: string) => `src = "${abs(p)}"\nscript = "${abs("script")}"`)
    .replace(/^libs\s*=\s*\[([^\]]*)\]/mu, (_, list: string) => `libs = [${list.replace(/"([^"]+)"/gu, (_m, p: string) => `"${abs(p)}"`)}]`)
    .replace(/=lib\//gu, `=${abs("lib")}/`)
    .replace(/^out\s*=.*$/mu, 'out = "out"');
  return patched.replace(/^\[profile\.default\]\s*$/mu, `[profile.default]\nallow_paths = ["${CONTRACTS}"]`);
}

function run(bin: string, args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const keep = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.once("error", (error) => reject(new Error(`could not run ${bin}: ${error.message}`)));
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited with ${code}:\n${output}`))));
  });
}

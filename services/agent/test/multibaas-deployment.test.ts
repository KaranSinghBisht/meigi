import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDeployment } from "../src/multibaas/deployment.js";
import { V2_START_BLOCK } from "../src/multibaas/labels.js";

const AWAJI = {
  chainId: 6497,
  registry: "0x295f67923B7eEC4f6A7619bafD9C0c2e12470fEE",
  resolver: "0x4dbF8b5C3da46996C156AC3d17B16a230387b7C4",
  router: "0xB2D61a2d1EF2C340F8b4cf9ec90E1eDCB08a6e84",
  token: "0x78f5f0Ac4EF201618b97638ded959b155c4f4B04",
  vault: "0x589E7f274Cd5E87d71443993AC30b39E2E70659e",
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meigi-contracts-"));
  mkdirSync(join(dir, "deployments"));
  writeFileSync(join(dir, "deployments/6497.json"), JSON.stringify(AWAJI));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function broadcast(name: "run-latest.json" | "dry-run/run-latest.json", receipts: string[], created = [AWAJI.registry, AWAJI.router, AWAJI.vault]) {
  mkdirSync(join(dir, "broadcast/Deploy.s.sol/6497/dry-run"), { recursive: true });
  const transactions = created.map((contractAddress) => ({ transactionType: "CREATE", contractAddress: contractAddress.toLowerCase() }));
  writeFileSync(join(dir, "broadcast/Deploy.s.sol/6497", name), JSON.stringify({ transactions, receipts: receipts.map((blockNumber) => ({ blockNumber })) }));
}

describe("the deployment to index", () => {
  it("starts at the first block of the broadcast that created the contracts", () => {
    broadcast("run-latest.json", ["0x246a60", "0x246a5f", "0x246a61"]);
    expect(loadDeployment(dir, 6497)).toMatchObject({ chainId: 6497, registry: AWAJI.registry, router: AWAJI.router, startBlock: 0x246a5f });
  });

  it("refuses a deployment file written by a dry run, unless told where to start", () => {
    broadcast("dry-run/run-latest.json", []);
    expect(() => loadDeployment(dir, 6497)).toThrow("chain 6497 has no broadcast yet (a dry run doesn't count)");
    expect(loadDeployment(dir, 6497, 2386600).startBlock).toBe(2386600);
  });

  it("refuses a broadcast that didn't create these addresses, or has no receipts yet", () => {
    broadcast("run-latest.json", ["0x1"], ["0x0000000000000000000000000000000000000001"]);
    expect(() => loadDeployment(dir, 6497)).toThrow(`the latest broadcast didn't create ${AWAJI.registry}`);
    broadcast("run-latest.json", []);
    expect(() => loadDeployment(dir, 6497)).toThrow("the latest broadcast has no receipts yet");
  });

  it("starts Sepolia at the v2 block, and names a chain with no deployment", () => {
    writeFileSync(join(dir, "deployments/11155111.json"), JSON.stringify({ ...AWAJI, chainId: 11155111 }));
    expect(loadDeployment(dir, 11155111).startBlock).toBe(V2_START_BLOCK);
    expect(() => loadDeployment(dir, 1)).toThrow("no Meigi deployment for chain 1");
  });
});

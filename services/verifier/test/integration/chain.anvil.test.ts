import { payeeRegistryAbi } from "@meigi/abi";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { addressTarget, signApproval } from "../../src/registry/approvals.js";
import { createChainPort, type ChainPort } from "../../src/registry/chain.js";
import { anvilAccounts, hasFoundry, startAnvil, type Anvil } from "./anvil.js";
import { deployWithForge, type Deployment } from "./deploy.js";

/**
 * Proves the real write path (sign locally -> sendRawTransaction -> confirm, and the transport-failure recovery
 * in sendKnown) against a real chain, not just types. Reuses services/agent's anvil/deploy helpers (copied into
 * this package rather than imported across the workspace boundary, to avoid wiring a new cross-package
 * dependency under time pressure); everything else here is the real production code path.
 */
describe.skipIf(!hasFoundry())("verifier's write path against a real chain (anvil)", () => {
  let anvil: Anvil;
  let deployment: Deployment;
  let accounts: ReturnType<typeof anvilAccounts>;
  let chain: ChainPort;
  let reader: ReturnType<typeof createPublicClient>;

  const OFFICER = `0x${"11".repeat(32)}` as Hex;
  const T1 = 2011001234501n;
  const T2 = 2011001234502n;

  beforeAll(async () => {
    accounts = anvilAccounts();
    anvil = await startAnvil(8551); // scratch port: distinct from agent's 8547 and world-live's 8787
    deployment = await deployWithForge({
      rpcUrl: anvil.url,
      deployerKey: accounts.deployer.key,
      attester: accounts.attester.address,
      agent: accounts.agent.address,
      vaultOwner: accounts.vaultOwner.address,
    });
    const config = loadConfig({
      SEPOLIA_RPC_URL: anvil.url,
      CHAIN_ID: "31337", // config.ts defaults to Sepolia's id; anvil's own chain id matters for the EIP-712 domain

      REGISTRY_ADDRESS: deployment.registry,
      ATTESTER_PRIVATE_KEY: accounts.attester.key,
      WORLD_APP_ID: "app_test",
      WORLD_RP_ID: "rp_test",
      WORLD_RP_SIGNING_KEY: `0x${"11".repeat(32)}`,
    } as unknown as NodeJS.ProcessEnv);
    chain = createChainPort(config);
    reader = createPublicClient({ chain: foundry, transport: http(anvil.url) });
  }, 30_000);

  afterAll(() => anvil?.stop());

  it("registers a real company through prepare -> sign -> sendRawTransaction -> confirm", async () => {
    const hash = await chain.register({
      tNumber: T1,
      legalName: "Anvil E2E KK",
      controller: accounts.controller.address,
      payout: accounts.controller.address,
      officers: [OFFICER],
      threshold: 1,
      evidence: `0x${"00".repeat(32)}` as Hex,
    });
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/u);
    const receipt = await reader.getTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");
    const payee = await chain.payee(T1);
    expect(payee.status).toBe(1);
    expect(payee.legalName).toBe("Anvil E2E KK");
  });

  it("cancels a real pending payout change (officer-approval-driven) the same way", async () => {
    const before = await chain.payee(T1);
    const newPayout = accounts.agent.address;
    const approval = await signApproval(chain.attester, {
      chainId: chain.chainId,
      registry: chain.registry,
      tNumber: T1,
      action: "PayoutChange",
      target: addressTarget(newPayout),
      officerIds: [OFFICER],
      nonce: before.nonce,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 900),
    });
    // Sets up the precondition directly (the controller requesting a change, approved by the attester) - the
    // real flow, minus a real World ID session behind the approval, which is out of scope for this test.
    const controllerClient = createWalletClient({
      account: privateKeyToAccount(accounts.controller.key),
      chain: foundry,
      transport: http(anvil.url),
    });
    const requestHash = await controllerClient.writeContract({
      address: chain.registry,
      abi: payeeRegistryAbi,
      functionName: "requestPayoutChange",
      args: [T1, newPayout, { officerIds: approval.officerIds, deadline: approval.deadline, signature: approval.signature }],
    });
    await reader.waitForTransactionReceipt({ hash: requestHash });
    expect((await chain.payee(T1)).pending).toBe(newPayout);

    const hash = await chain.cancelPayoutChange(T1); // the real write path under test
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/u);
    const after = await chain.payee(T1);
    expect(after.pending).toBe("0x0000000000000000000000000000000000000000");
  });

  it("resolves as sent, without signing again, when the send response is lost after the node accepted it", async () => {
    const realFetch = globalThis.fetch;
    let intercepted = false;
    globalThis.fetch = (async (input, init) => {
      const body = typeof init?.body === "string" ? init.body : "";
      if (!intercepted && body.includes("eth_sendRawTransaction")) {
        intercepted = true;
        await realFetch(input, init); // let the real anvil actually accept it...
        throw new TypeError("fetch failed"); // ...then simulate the response never reaching us
      }
      return realFetch(input, init);
    }) as typeof fetch;
    try {
      const hash = await chain.register({
        tNumber: T2,
        legalName: "Anvil E2E Recovered KK",
        controller: accounts.controller.address,
        payout: accounts.controller.address,
        officers: [OFFICER],
        threshold: 1,
        evidence: `0x${"00".repeat(32)}` as Hex,
      });
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/u);
      expect(intercepted).toBe(true); // the fault actually fired, this isn't a no-op
      const payee = await chain.payee(T2);
      expect(payee.status).toBe(1); // genuinely landed once - a second attempt would have reverted, not resolved
      expect(payee.legalName).toBe("Anvil E2E Recovered KK");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

import { anvilAccounts, startAnvil, type Anvil } from "./anvil.js";
import { deployWithForge, type Deployment } from "./deploy.js";
import { demoVendors, seedDemo, type DemoVendor } from "./seed.js";

export interface LocalStack {
  anvil: Anvil;
  deployment: Deployment;
  accounts: ReturnType<typeof anvilAccounts>;
  vendors: DemoVendor[];
}

/** A fresh anvil with the Meigi contracts deployed by forge and the demo vendors registered, approved and funded. */
export async function startLocalStack(opts: { port?: number; fundYen?: string } = {}): Promise<LocalStack> {
  const accounts = anvilAccounts();
  const anvil = await startAnvil(opts.port);
  try {
    const deployment = await deployWithForge({
      rpcUrl: anvil.url,
      deployerKey: accounts.deployer.key,
      attester: accounts.attester.address,
      agent: accounts.agent.address,
      vaultOwner: accounts.vaultOwner.address,
    });
    const vendors = demoVendors();
    await seedDemo({
      rpcUrl: anvil.url,
      deployment,
      attesterKey: accounts.attester.key,
      vaultOwnerKey: accounts.vaultOwner.key,
      controller: accounts.controller.address,
      vendors,
      fundYen: opts.fundYen ?? "5000000",
    });
    return { anvil, deployment, accounts, vendors };
  } catch (error) {
    anvil.stop();
    throw error;
  }
}

/** Where the agent reaches this stack's signer, and the token they share. */
export interface SignerLink {
  url: string;
  token: string;
}

/** The agent's environment for this stack: no key; the stack's signer holds the agent key. */
export function agentEnv(stack: LocalStack, signer: SignerLink): Record<string, string> {
  return {
    SEPOLIA_RPC_URL: stack.anvil.url,
    CHAIN_ID: "31337",
    AGENT_ADDRESS: stack.accounts.agent.address,
    SIGNER_URL: signer.url,
    SIGNER_TOKEN: signer.token,
    REGISTRY_ADDRESS: stack.deployment.registry,
    VAULT_ADDRESS: stack.deployment.vault,
    TOKEN_ADDRESS: stack.deployment.token,
    VENDOR_T_NUMBERS: stack.vendors.map((vendor) => vendor.tNumber).join(","),
  };
}

/** The signer's environment for this stack: anvil's public dev key as the agent key, on its own port. */
export function signerEnv(stack: LocalStack, signer: { port: number; token: string; humanAboveYen?: number }): Record<string, string> {
  return {
    AGENT_PRIVATE_KEY: stack.accounts.agent.key,
    SIGNER_TOKEN: signer.token,
    SEPOLIA_RPC_URL: stack.anvil.url,
    CHAIN_ID: "31337",
    VAULT_ADDRESS: stack.deployment.vault,
    SIGNER_PORT: String(signer.port),
    ...(signer.humanAboveYen ? { SIGNER_HUMAN_ABOVE_YEN: String(signer.humanAboveYen) } : {}),
  };
}

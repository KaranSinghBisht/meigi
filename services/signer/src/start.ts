import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentVaultAbi } from "@meigi/abi";
import { createPublicClient, createWalletClient, erc20Abi, getAddress, http, type Address, type Chain, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";
import { createSignerApp } from "./app.js";
import { ConfigError, type Config } from "./config.js";
import { createPayer } from "./payer.js";
import { approversFrom, createApprovalVerifier, type ApprovalVerifier } from "./verify.js";

/** services/signer: relative paths in the config resolve here, whatever the working directory. */
const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

export class RoleError extends Error {
  override readonly name = "RoleError";
}

export interface StartedSigner {
  app: ReturnType<typeof createSignerApp>;
  agent: Address;
  verifiesApproval: boolean;
}

export interface StartOptions {
  now?: () => number; // unix seconds
  fetch?: typeof fetch; // for the World ID provider's discovery and keys (tests)
}

/** Phase 2's verifier, when SIGNER_VERIFY_APPROVAL=1. Never a silent fallback to Phase 1. */
function verifierFor(config: Config, now: () => number, fetcher?: typeof fetch): ApprovalVerifier | undefined {
  if (config.SIGNER_VERIFY_APPROVAL !== "1") return undefined;
  if (!config.WORLD_AGENTS_ISSUER || !config.WORLD_AGENTS_CLIENT_ID) throw new ConfigError("SIGNER_VERIFY_APPROVAL=1 needs WORLD_AGENTS_ISSUER and WORLD_AGENTS_CLIENT_ID");
  return createApprovalVerifier({
    issuer: config.WORLD_AGENTS_ISSUER,
    clientId: config.WORLD_AGENTS_CLIENT_ID,
    isApprover: approversFrom({
      signerOnly: config.SIGNER_APPROVERS,
      pinned: config.WORLD_AGENTS_APPROVERS,
      enrolledPath: resolve(PACKAGE_DIR, config.WORLD_AGENTS_APPROVERS_PATH),
    }),
    maxAgeS: config.SIGNER_APPROVAL_MAX_AGE_S,
    now,
    ...(fetcher ? { fetch: fetcher } : {}),
  });
}

function chainFor(chainId: number): Chain {
  if (chainId === sepolia.id) return sepolia;
  if (chainId === foundry.id) return foundry;
  throw new RoleError(`unsupported chain id ${chainId}`);
}

/**
 * Builds the signer from its configuration, after checking on-chain that its key is the vault's agent and not the
 * owner (the owner may pay an invoice twice). Reads the token's decimals to turn the yen ceiling into units.
 */
export async function startSigner(config: Config, options: StartOptions = {}): Promise<StartedSigner> {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const chain = chainFor(config.CHAIN_ID);
  const transport = http(config.SEPOLIA_RPC_URL, { timeout: 15_000 });
  const account = privateKeyToAccount(config.AGENT_PRIVATE_KEY as Hex);
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  const walletClient = createWalletClient({ chain, transport, account });
  const vault = { address: config.VAULT_ADDRESS as Address, abi: agentVaultAbi } as const;
  const [agent, owner, token] = await Promise.all([
    publicClient.readContract({ ...vault, functionName: "agent" }),
    publicClient.readContract({ ...vault, functionName: "owner" }),
    publicClient.readContract({ ...vault, functionName: "token" }),
  ]);
  if (getAddress(account.address) === getAddress(owner)) throw new RoleError("AGENT_PRIVATE_KEY is the vault owner's key; the signer holds the agent key only");
  if (getAddress(account.address) !== getAddress(agent)) throw new RoleError(`AGENT_PRIVATE_KEY is ${account.address}, but the vault's agent is ${agent}`);
  const decimals = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
  const verifier = verifierFor(config, now, options.fetch);
  const app = createSignerApp({
    payer: createPayer({ publicClient, walletClient, vault: vault.address }),
    token: config.SIGNER_TOKEN,
    policy: {
      ceilingUnits: BigInt(config.SIGNER_HUMAN_ABOVE_YEN) * 10n ** BigInt(decimals),
      ceilingYen: config.SIGNER_HUMAN_ABOVE_YEN,
      maxAgeS: config.SIGNER_APPROVAL_MAX_AGE_S,
      now,
      issuer: config.WORLD_AGENTS_ISSUER,
      clientId: config.WORLD_AGENTS_CLIENT_ID,
    },
    info: { agent: account.address, vault: vault.address, chainId: config.CHAIN_ID, humanAboveYen: config.SIGNER_HUMAN_ABOVE_YEN },
    verifier,
  });
  return { app, agent: account.address, verifiesApproval: verifier !== undefined };
}

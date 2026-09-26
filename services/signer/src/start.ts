import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { agentVaultAbi } from "@meigi/abi";
import { createPublicClient, createWalletClient, erc20Abi, fallback, getAddress, http, type Address, type Chain, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";
import { createSignerApp } from "./app.js";
import { ConfigError, type Config } from "./config.js";
import { createPayer } from "./payer.js";
import { readRoute, RouteError, type Via } from "./route.js";
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
  via: Via; // "gate" with SIGNER_VIA_GATE=1: payInvoice goes through the MandateGate
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
 * Builds the signer from its configuration, after checking on-chain that its key is not the owner (the owner may pay
 * an invoice twice) and is the vault's agent, directly or through the MandateGate (route.ts). Reads the token's
 * decimals to turn the yen ceiling into units.
 */
export async function startSigner(config: Config, options: StartOptions = {}): Promise<StartedSigner> {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const chain = chainFor(config.CHAIN_ID);
  // Reads fall back to SEPOLIA_RPC_FALLBACK_URL when the primary fails; a payment is signed once and broadcast by
  // broadcast.ts, which settles a transport error by asking both RPCs for its hash.
  const urls = [config.SEPOLIA_RPC_URL, ...(config.SEPOLIA_RPC_FALLBACK_URL ? [config.SEPOLIA_RPC_FALLBACK_URL] : [])];
  const one = (url: string) => http(url, { timeout: 15_000, ...(urls.length > 1 ? { retryCount: 1 } : {}) });
  const transport = urls.length > 1 ? fallback(urls.map(one)) : one(urls[0]!);
  const account = privateKeyToAccount(config.AGENT_PRIVATE_KEY as Hex);
  const publicClient = createPublicClient({ chain, transport }) as PublicClient;
  const walletClient = createWalletClient({ chain, transport, account });
  const rpcs = urls.map((url) => createPublicClient({ chain, transport: one(url) }));
  const vault = { address: config.VAULT_ADDRESS as Address, abi: agentVaultAbi } as const;
  const gate = config.MANDATE_GATE_ADDRESS ? getAddress(config.MANDATE_GATE_ADDRESS) : null;
  const [route, token] = await Promise.all([
    readRoute(publicClient, account.address, vault.address, {
      viaGate: config.SIGNER_VIA_GATE === "1",
      gate,
      ...(config.MANDATE_PRINCIPAL ? { mandate: { principal: BigInt(config.MANDATE_PRINCIPAL), label: config.MANDATE_LABEL } } : {}),
    }).catch((error: unknown) => {
      throw error instanceof RouteError ? new RoleError(error.message) : error;
    }),
    publicClient.readContract({ ...vault, functionName: "token" }),
  ]);
  const decimals = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" });
  const verifier = verifierFor(config, now, options.fetch);
  const app = createSignerApp({
    payer: createPayer({ publicClient, walletClient, target: route.target, rpcs }),
    token: config.SIGNER_TOKEN,
    policy: {
      ceilingUnits: BigInt(config.SIGNER_HUMAN_ABOVE_YEN) * 10n ** BigInt(decimals),
      ceilingYen: config.SIGNER_HUMAN_ABOVE_YEN,
      maxAgeS: config.SIGNER_APPROVAL_MAX_AGE_S,
      now,
      issuer: config.WORLD_AGENTS_ISSUER,
      clientId: config.WORLD_AGENTS_CLIENT_ID,
    },
    info: { agent: account.address, vault: vault.address, chainId: config.CHAIN_ID, humanAboveYen: config.SIGNER_HUMAN_ABOVE_YEN, via: route.via, gate: route.gate },
    verifier,
  });
  return { app, agent: account.address, verifiesApproval: verifier !== undefined, via: route.via };
}

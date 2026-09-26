import { x402Facilitator } from "@x402/core/facilitator";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { createWalletClient, http, publicActions, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "./config.js";
import type { Rail } from "./rail.js";

type SupportedResponse = Awaited<ReturnType<FacilitatorClient["getSupported"]>>;

/** The rail's hosted facilitator if it has one (Mizuhiki's, on Awaji), otherwise the in-process one. */
export function facilitatorFor(config: Config, rail: Rail): FacilitatorClient {
  return rail.facilitatorUrl ? new HTTPFacilitatorClient({ url: rail.facilitatorUrl }) : localFacilitator(config, rail);
}

/**
 * A self-hosted x402 facilitator, in-process. It verifies EIP-3009 authorizations and settles them on the rail's
 * chain with its own key (it pays the gas). The public x402.org facilitator only serves Base Sepolia.
 */
export function localFacilitator(config: Config, rail: Rail): FacilitatorClient {
  const account = privateKeyToAccount(config.FACILITATOR_PRIVATE_KEY as Hex);
  const client = createWalletClient({ account, chain: rail.chain, transport: http(rail.rpcUrl) }).extend(publicActions);
  // x402 describes the signer structurally; adapt viem's stricter overloads explicitly.
  const signer = toFacilitatorEvmSigner({
    address: account.address,
    readContract: (args) => client.readContract(args as Parameters<typeof client.readContract>[0]),
    verifyTypedData: (args) => client.verifyTypedData(args as Parameters<typeof client.verifyTypedData>[0]),
    writeContract: (args) => client.writeContract(args as Parameters<typeof client.writeContract>[0]),
    sendTransaction: (args) => client.sendTransaction(args),
    waitForTransactionReceipt: (args) => client.waitForTransactionReceipt(args),
    getCode: (args) => client.getCode(args),
  });
  const facilitator = new x402Facilitator().register(rail.network, new ExactEvmScheme(signer));
  return {
    verify: (payload, requirements) => facilitator.verify(payload, requirements),
    settle: (payload, requirements) => facilitator.settle(payload, requirements),
    getSupported: async () => facilitator.getSupported() as SupportedResponse,
  };
}

import { payeeRegistryAbi } from "@meigi/abi";
import type { Address, PublicClient } from "viem";
import type { PayeeRecord } from "./check.js";

/** Reads payees from a deployed PayeeRegistry. */
export function registryReader(client: PublicClient, registry: Address) {
  return async function payee(tNumber: bigint): Promise<PayeeRecord> {
    const view = await client.readContract({
      address: registry,
      abi: payeeRegistryAbi,
      functionName: "payeeOf",
      args: [tNumber],
    });
    return { status: Number(view.status), legalName: view.legalName, payout: view.payout };
  };
}

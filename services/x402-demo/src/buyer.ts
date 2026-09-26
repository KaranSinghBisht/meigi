import { ensResolver, interceptaScreen, registerMeigiGuard, registryReader, type GuardVerdict } from "@meigi/x402-guard";
import { x402Client } from "@x402/core/client";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { createPublicClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MAX_PRICE_YEN, UNVERIFIED_MAX_YEN, type Config } from "./config.js";
import { railOf, readTransport, yen } from "./rail.js";

export interface PurchaseResult {
  verdict: GuardVerdict | null;
  paid: boolean;
  data: unknown;
  settlement: unknown;
  error?: string;
}

/**
 * A buyer agent with the Meigi guard installed. A merchant that declares a T-number is paid only at that
 * company's registered payout. A merchant that declares nothing is paid only small amounts, and only after
 * Intercepta screening clears its `payTo`; without an Intercepta key it is refused.
 */
export function guardedBuyer(config: Config) {
  const rail = railOf(config);
  const account = privateKeyToAccount(config.DEMO_BUYER_PRIVATE_KEY as Hex);
  const publicClient = createPublicClient({ chain: rail.chain, transport: readTransport(rail) });
  const signer = toClientEvmSigner(account, publicClient);
  const guardDeps = {
    network: rail.network,
    payee: registryReader(publicClient, rail.registry),
    // On Sepolia, an independent check alongside the registry: the merchant's declared ens (if any) must resolve
    // to the same payout. Stock viem, the same public client as the registry read: the default Sepolia UR, no
    // override. Awaji has no ENS, so there the registry is the only check.
    resolveEns: rail.ens ? ensResolver(publicClient) : undefined,
    screen: config.INTERCEPTA_API_KEY ? interceptaScreen({ apiKey: config.INTERCEPTA_API_KEY }) : undefined,
  };
  const maxPerPayment = yen(rail, MAX_PRICE_YEN).toString();

  return async function buy(url: string, init?: RequestInit): Promise<PurchaseResult> {
    let verdict: GuardVerdict | null = null;
    const record = (v: GuardVerdict) => {
      verdict = v;
    };
    const client = registerMeigiGuard(
      new x402Client()
        .register(rail.network, new ExactEvmScheme(signer))
        .setSpendControls({ allowedAssets: [{ network: rail.network, asset: rail.asset.address, maxAmountPerPayment: maxPerPayment }] }),
      guardDeps,
      { onVerdict: record, undeclared: { screen: guardDeps.screen, maxAmount: yen(rail, UNVERIFIED_MAX_YEN) } },
    );
    try {
      const response = await wrapFetchWithPayment(fetch, client)(url, init);
      const header = response.headers.get("PAYMENT-RESPONSE");
      const data: unknown = response.ok ? await response.json() : null;
      return { verdict, paid: response.ok, data, settlement: header ? decodePaymentResponseHeader(header) : null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "payment failed";
      return { verdict, paid: false, data: null, settlement: null, error: message };
    }
  };
}

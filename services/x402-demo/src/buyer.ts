import {
  interceptaScreen,
  meigiPayeeExtension,
  registryReader,
  requireMeigiPayee,
  type GuardVerdict,
} from "@meigi/x402-guard";
import { x402Client } from "@x402/core/client";
import { toClientEvmSigner } from "@x402/evm";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { NETWORK, PRICE_ATOMIC, type Config } from "./config.js";

export interface PurchaseResult {
  verdict: GuardVerdict | null;
  paid: boolean;
  data: unknown;
  settlement: unknown;
  error?: string;
}

/**
 * A buyer agent with the Meigi guard installed: it refuses to sign unless `payTo` is the declaring company's
 * registered payout, and refuses merchants that declare nothing.
 */
export function guardedBuyer(config: Config) {
  const account = privateKeyToAccount(config.DEMO_BUYER_PRIVATE_KEY as Hex);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(config.SEPOLIA_RPC_URL) });
  const signer = toClientEvmSigner(account, publicClient);
  const guardDeps = {
    network: NETWORK,
    payee: registryReader(publicClient, config.REGISTRY_ADDRESS as Address),
    screen: config.INTERCEPTA_API_KEY ? interceptaScreen({ apiKey: config.INTERCEPTA_API_KEY }) : undefined,
  };

  return async function buy(url: string): Promise<PurchaseResult> {
    let verdict: GuardVerdict | null = null;
    const record = (v: GuardVerdict) => {
      verdict = v;
    };
    const client = new x402Client()
      .register(NETWORK, new ExactEvmScheme(signer))
      .setSpendControls({ allowedAssets: [{ network: NETWORK, asset: config.TOKEN_ADDRESS, maxAmountPerPayment: PRICE_ATOMIC }] })
      .registerExtension(meigiPayeeExtension(guardDeps, { onVerdict: record }))
      .onBeforePaymentCreation(requireMeigiPayee({ onVerdict: record }));
    try {
      const response = await wrapFetchWithPayment(fetch, client)(url);
      const header = response.headers.get("PAYMENT-RESPONSE");
      const data: unknown = response.ok ? await response.json() : null;
      return { verdict, paid: response.ok, data, settlement: header ? decodePaymentResponseHeader(header) : null };
    } catch (error) {
      const message = error instanceof Error ? error.message : "payment failed";
      return { verdict, paid: false, data: null, settlement: null, error: message };
    }
  };
}

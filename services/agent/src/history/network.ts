import type { MultiBaas } from "../multibaas/client.js";
import { X402_BUYERS } from "../multibaas/labels.js";
import { createMultiBaasHistory, payeesRegistered, routerPaid, tokenInfo, x402Transfers } from "./multibaas.js";
import type { ReceivedTotal, RegisteredPayee, SettledPayment, TokenInfo, X402Transfer } from "./types.js";

/**
 * A second network Meigi runs on, read only through its own MultiBaas deployment: Mizuhiki Awaji, the way Curvegrid's
 * Matsuri sample reads it. The agent doesn't pay there; the section shows what the contracts recorded.
 */

export const MIZUHIKI_AWAJI = {
  chainId: 6497,
  name: "Mizuhiki Awaji",
  label: "Mizuhiki · via MultiBaas",
  explorer: "https://awaji.blockscout.com",
} as const;

export interface NetworkSnapshot {
  token: TokenInfo;
  settled: SettledPayment[]; // the vault's InvoicePaid and the router's Paid, newest first
  x402: X402Transfer[]; // the research agent's purchases from registered payees, newest first ([] without a buyer)
  payees: RegisteredPayee[];
  received: ReceivedTotal[]; // per registered payout
}

export interface IndexedNetwork {
  chainId: number;
  name: string;
  label: string;
  explorer: string;
  /** Throws MultiBaasUnavailable when MultiBaas can't answer, or serves another chain. */
  read(limit: number): Promise<NetworkSnapshot>;
}

export function createIndexedNetwork(mb: MultiBaas, network: Omit<IndexedNetwork, "read"> = MIZUHIKI_AWAJI): IndexedNetwork {
  const history = createMultiBaasHistory(mb, network.chainId);
  let checked: Promise<void> | null = null; // the deployment's chain, checked once (again after a failure)
  const sameChain = () => {
    checked ??= mb.requireChain(network.chainId).catch((error: unknown) => {
      checked = null;
      throw error;
    });
    return checked;
  };
  let token: Promise<TokenInfo> | null = null; // read once: a token's symbol and decimals don't change
  const tokenOnce = () => {
    token ??= tokenInfo(mb).catch((error: unknown) => {
      token = null;
      throw error;
    });
    return token;
  };
  return {
    ...network,
    async read(limit) {
      await sameChain(); // before any query: never show another chain's events under this label
      const buyer = X402_BUYERS[network.chainId];
      const [vault, router, payees, sent] = await Promise.all([
        history.invoicesPaid(limit),
        routerPaid(mb, limit),
        payeesRegistered(mb),
        buyer ? x402Transfers(mb, buyer, limit) : Promise.resolve([]),
      ]);
      const [received, info] = await Promise.all([history.received(payees.map((p) => p.payout)), tokenOnce()]);
      const newest = (a: { blockNumber: bigint }, b: { blockNumber: bigint }) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1);
      const settled = [...vault, ...router].sort(newest).slice(0, limit);
      // A purchase is a transfer to a registered payout that isn't already a vault or router payment.
      const payouts = new Set(payees.map((p) => p.payout.toLowerCase()));
      const paid = new Set([...vault, ...router].map((p) => p.txHash.toLowerCase()));
      const x402 = sent.filter((t) => payouts.has(t.recipient.toLowerCase()) && !paid.has(t.txHash.toLowerCase())).sort(newest).slice(0, limit);
      return { token: info, settled, x402, payees, received };
    },
  };
}

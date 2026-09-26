import type { MultiBaas } from "../multibaas/client.js";
import { createMultiBaasHistory, payeesRegistered, routerPaid, tokenInfo } from "./multibaas.js";
import type { ReceivedTotal, RegisteredPayee, SettledPayment, TokenInfo } from "./types.js";

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
      const [vault, router, payees] = await Promise.all([history.invoicesPaid(limit), routerPaid(mb, limit), payeesRegistered(mb)]);
      const [received, info] = await Promise.all([history.received(payees.map((p) => p.payout)), tokenOnce()]);
      const settled = [...vault, ...router].sort((a, b) => (a.blockNumber === b.blockNumber ? 0 : a.blockNumber > b.blockNumber ? -1 : 1)).slice(0, limit);
      return { token: info, settled, payees, received };
    },
  };
}

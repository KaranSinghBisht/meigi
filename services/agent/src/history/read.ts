import { MultiBaasUnavailable } from "../multibaas/client.js";
import type { PaymentHistory } from "./types.js";

export interface HistorySources {
  multibaas: PaymentHistory | null; // null: MULTIBAAS_URL / MULTIBAAS_API_KEY not set
  rpc: PaymentHistory;
}

export interface Sourced<T> {
  value: T;
  source: "multibaas" | "rpc";
  note?: string; // why MultiBaas wasn't used, when it is configured
}

/** Reads from MultiBaas when it is configured, and from RPC logs when it isn't or can't answer. */
export async function readHistory<T>(sources: HistorySources, read: (history: PaymentHistory) => Promise<T>): Promise<Sourced<T>> {
  if (sources.multibaas) {
    try {
      return { value: await read(sources.multibaas), source: "multibaas" };
    } catch (error) {
      if (!(error instanceof MultiBaasUnavailable)) throw error;
      return { value: await read(sources.rpc), source: "rpc", note: `MultiBaas unavailable (${error.message}); read from RPC logs` };
    }
  }
  return { value: await read(sources.rpc), source: "rpc" };
}

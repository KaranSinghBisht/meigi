import type { Context } from "hono";
import type { DomainProofInput, DomainProofResult } from "./domain/proof.js";
import type { LeiRegistry } from "./lei/lei.js";
import type { Policy } from "./limits/policy.js";
import type { CorporationIndex } from "./nta/corporations.js";
import type { ChainPort } from "./registry/chain.js";
import type { Store } from "./store/db.js";
import type { IdkitRpContext, VerifiedSession } from "./world/session.js";

/** Everything the routes need, injected so tests can swap in fakes. */
export interface AppDeps {
  corporations: CorporationIndex;
  store: Store;
  chain: ChainPort;
  world: {
    /** A fresh, backend-signed `rp_context` in the exact shape IDKit takes. */
    rpContext(): IdkitRpContext;
    /** Verifies an IDKit session result; if `signal` is given, the proof must carry exactly that signal. */
    verify(result: unknown, signal?: string): Promise<VerifiedSession>;
  };
  domain: { verify(input: DomainProofInput): Promise<DomainProofResult> };
  /** GLEIF's public LEI registry, for companies outside Japan. */
  lei: LeiRegistry;
  origins: string[];
  /** Fictional demo companies (registry office 9999 only) may skip the NTA match and domain proof. */
  fixtures?: boolean;
  /** Anti-squatting limits; anything left out uses DEFAULT_POLICY. */
  policy?: Partial<Omit<Policy, "ratePerHour">> & { ratePerHour?: Partial<Policy["ratePerHour"]> };
  /** The client a request is rate-limited as (default: one shared "unknown" client). */
  clientIp?: (c: Context) => string;
  now?: () => number; // unix seconds; injectable for tests
}

export function nowSeconds(deps: AppDeps): number {
  return deps.now ? deps.now() : Math.floor(Date.now() / 1000);
}

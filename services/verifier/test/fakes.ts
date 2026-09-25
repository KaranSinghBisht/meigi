import { zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { AppDeps } from "../src/deps.js";
import type { Corporation } from "../src/nta/corporations.js";
import type { ChainPort, PayeeState, RegistrationArgs } from "../src/registry/chain.js";
import { openStore } from "../src/store/db.js";
import { officerIdFor, WorldVerificationError } from "../src/world/session.js";

export const ATTESTER = privateKeyToAccount(`0x${"a7".repeat(32)}`);
export const REGISTRY: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const CONTROLLER: Address = "0x1111111111111111111111111111111111111111";
export const PAYOUT: Address = "0x2222222222222222222222222222222222222222";

export const curvegrid: Corporation = {
  number: "1010601051968",
  name: "Ｃｕｒｖｅｇｒｉｄ株式会社",
  kind: "301",
  pref: "東京都",
  city: "渋谷区",
  street: "",
  postCode: "",
  closeDate: "",
  enName: "Curvegrid Inc.",
  furigana: "",
};

export function sessionId(tag: string): string {
  return `session_${tag.repeat(128).slice(0, 128)}`;
}

/** What a World ID session result looks like to our fake verifier. */
export function proof(session: string, nullifier: string, signal: string) {
  return { session_id: session, signal, responses: [{ session_nullifier: [nullifier, "0x0"] }] };
}

export class FakeChain implements ChainPort {
  chainId = 11155111;
  registry = REGISTRY;
  attester = ATTESTER;
  payees = new Map<bigint, PayeeState & { officers: Hex[] }>();
  calls: string[] = [];

  async payee(t: bigint): Promise<PayeeState> {
    const p = this.payees.get(t);
    return p ?? { status: 0, legalName: "", controller: zeroAddress, payout: zeroAddress, pending: zeroAddress,
      nextController: zeroAddress, nonce: 0n, threshold: 0 };
  }
  async officers(t: bigint): Promise<Hex[]> {
    return this.payees.get(t)?.officers ?? [];
  }
  async register(a: RegistrationArgs): Promise<Hex> {
    this.calls.push(`register:${a.tNumber}:${a.threshold}:${a.officers.join(",")}`);
    this.payees.set(a.tNumber, { status: 1, legalName: a.legalName, controller: a.controller, payout: a.payout,
      pending: zeroAddress, nextController: zeroAddress, nonce: 1n, threshold: a.threshold, officers: a.officers });
    return "0xabc1";
  }
  async fileDispute(t: bigint, claimant: Address): Promise<Hex> {
    this.calls.push(`dispute:${t}:${claimant}`);
    return "0xabc2";
  }
  async cancelPayoutChange(t: bigint): Promise<Hex> {
    this.calls.push(`cancelPayout:${t}`);
    return "0xabc3";
  }
  async cancelRotation(t: bigint): Promise<Hex> {
    this.calls.push(`cancelRotation:${t}`);
    return "0xabc4";
  }
  async relayRotation(t: bigint, to: Address): Promise<Hex> {
    this.calls.push(`rotate:${t}:${to}`);
    return "0xabc5";
  }
}

export function fakeDeps(chain: FakeChain, clock: { now: number }): AppDeps {
  return {
    corporations: { byNumber: (d) => (d === curvegrid.number ? curvegrid : null) },
    store: openStore(":memory:"),
    chain,
    world: {
      rpContext: () => ({ sig: "0xsig", nonce: "0x01", created_at: clock.now, expires_at: clock.now + 300 }),
      async verify(result, signal) {
        const r = result as { session_id: string; signal: string; responses: { session_nullifier: string[] }[] };
        if (signal && r.signal !== signal) throw new WorldVerificationError("signal_mismatch", "wrong signal");
        return { sessionId: r.session_id, officerId: officerIdFor(r.session_id), sessionNullifier: r.responses[0]!.session_nullifier[0]! };
      },
    },
    domain: { verify: async (input) => (input.domain === "curvegrid.co.jp" ? { ok: true, method: "dns" } : { ok: false, reason: "no_proof_found" }) },
    origins: ["http://localhost:5173"],
    now: () => clock.now,
  };
}

import { getAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import type { AppDeps } from "../deps.js";
import { isFixture } from "../fixtures.js";
import { HttpError } from "../http.js";
import type { RegistrationRecord } from "../store/db.js";
import { toChainId } from "../tnumber.js";
import { sortOfficerIds } from "./approvals.js";

/** What a fixture's on-chain evidence says about it, so the registry records it as fictional. */
const FIXTURE_EVIDENCE = "fictional demo company: registry office 9999 is never issued; no NTA match, no domain proof";

export type Outcome = "registered" | "disputed";

/** Whether writing the registration now registers it, or files a dispute because the T-number is already claimed. */
export async function plannedOutcome(deps: AppDeps, registration: RegistrationRecord): Promise<Outcome> {
  const current = await deps.chain.payee(toChainId(registration.tNumber));
  if (current.status === 0) return "registered";
  if (current.controller === getAddress(registration.controller)) {
    throw new HttpError(409, "already_registered", "this business already controls the payee");
  }
  return "disputed";
}

/** The attester writes the registration on-chain (or files the dispute) and records the outcome. */
export async function submitOnChain(
  deps: AppDeps,
  registration: RegistrationRecord,
  threshold: number,
  outcome: Outcome,
): Promise<{ outcome: Outcome; txHash: Hex }> {
  const officers = sortOfficerIds(deps.store.officersOf(registration.id).map((o) => o.officerId as Hex));
  const tNumber = toChainId(registration.tNumber);
  const fixture = isFixture(deps, registration.tNumber) ? FIXTURE_EVIDENCE : undefined;
  const evidence = keccak256(toBytes(JSON.stringify({ ...evidenceFields(registration), officers, threshold, fixture })));
  const controller = registration.controller as Address;
  const txHash =
    outcome === "registered"
      ? await deps.chain.register({
          legalName: registration.legalName,
          controller,
          payout: registration.payout as Address,
          officers,
          threshold,
          evidence,
          tNumber,
        })
      : await deps.chain.fileDispute(tNumber, controller, evidence);
  deps.store.setOutcome(registration.id, outcome, txHash);
  return { outcome, txHash };
}

/** The fields the evidence hash has always covered; later columns stay out, so the hash doesn't change. */
function evidenceFields(r: RegistrationRecord) {
  const { id, tNumber, legalName, domain, controller, payout, challenge, domainMethod, outcome, txHash } = r;
  return { id, tNumber, legalName, domain, controller, payout, challenge, domainMethod, outcome, txHash };
}

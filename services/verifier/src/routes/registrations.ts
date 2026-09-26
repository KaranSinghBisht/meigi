import { Hono } from "hono";
import { getAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { domainProofMessage, normalizeDomain, TXT_PREFIX, txtRecordName } from "../domain/proof.js";
import { HttpError } from "../http.js";
import { checkRegisteredName } from "../nta/corporations.js";
import { sortOfficerIds } from "../registry/approvals.js";
import type { RegistrationRecord } from "../store/db.js";
import { formatTNumber, hasCorporateCheckDigit, isUnassignableOffice, toChainId } from "../tnumber.js";
import { requireDigits } from "./lookup.js";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);
const createBody = z.object({
  tNumber: z.string().max(20),
  legalName: z.string().min(1).max(200),
  domain: z.string().min(3).max(253),
  controller: address,
  payout: address,
});
const proofBody = z.object({ result: z.record(z.string(), z.unknown()) });
const submitBody = z.object({ threshold: z.number().int().min(1).max(8) });

const NTA_MESSAGES = {
  not_found: "No corporation with this number in the NTA data. Sole proprietors go to manual review.",
  closed: "The NTA data lists this corporation as closed.",
  name_mismatch: "The name doesn't exactly match the NTA-registered name. Fuzzy matches are never accepted.",
} as const;

/** What a fixture's on-chain evidence says about it, so the registry records it as fictional. */
const FIXTURE_EVIDENCE = "fictional demo company: registry office 9999 is never issued; no NTA match, no domain proof";

/** A fictional demo company: fixtures enabled, and a number no real company can hold. */
function isFixture(deps: AppDeps, digits: string): boolean {
  return deps.fixtures === true && isUnassignableOffice(digits) && hasCorporateCheckDigit(digits);
}

type NameResult = { ok: true; legalName: string; fixture: boolean } | { ok: false; body: Record<string, unknown> };

/** The exact NTA-registered name, or, for a fixture, the name as given. */
function registeredName(deps: AppDeps, digits: string, claimed: string): NameResult {
  if (isFixture(deps, digits)) return { ok: true, legalName: claimed.trim(), fixture: true };
  const nta = checkRegisteredName(deps.corporations, digits, claimed);
  if (nta.ok) return { ok: true, legalName: nta.corporation.name, fixture: false };
  const body = { code: `nta_${nta.reason}`, message: NTA_MESSAGES[nta.reason], registered: nta.corporation?.name };
  return { ok: false, body };
}

/** The signal an officer's enrollment proof must carry: binds the World ID session to this registration. */
export function enrollmentSignal(registrationId: string): string {
  return `meigi:v1:enroll:${registrationId}`;
}

export function registrationRoutes(deps: AppDeps) {
  const app = new Hono();

  function load(id: string): RegistrationRecord {
    const registration = deps.store.getRegistration(id);
    if (!registration) throw new HttpError(404, "registration_not_found", "unknown registration");
    return registration;
  }

  /** Step 1: exact NTA match, then a domain-proof challenge for the controller wallet to sign. */
  app.post("/", async (c) => {
    const body = createBody.parse(await c.req.json());
    const digits = requireDigits(body.tNumber);
    const domain = normalizeDomain(body.domain);
    if (!domain) throw new HttpError(400, "invalid_domain", "expected a public domain name like example.co.jp");
    const name = registeredName(deps, digits, body.legalName);
    if (!name.ok) return c.json(name.body, 422);
    const { id, challenge } = deps.store.createRegistration({
      tNumber: digits,
      legalName: name.legalName,
      domain,
      controller: getAddress(body.controller),
      payout: getAddress(body.payout),
    });
    const tNumber = formatTNumber(digits);
    return c.json(
      {
        id,
        legalName: name.legalName,
        fixture: name.fixture,
        domainProof: {
          message: domainProofMessage(domain, tNumber, challenge),
          txtName: txtRecordName(domain),
          txtValuePrefix: TXT_PREFIX,
          wellKnownUrl: `https://${domain}/.well-known/meigi.json`,
        },
        enrollmentSignal: enrollmentSignal(id),
      },
      201,
    );
  });

  /** Step 2: the signed challenge is published in DNS (or .well-known). */
  app.post("/:id/domain", async (c) => {
    const registration = load(c.req.param("id"));
    if (isFixture(deps, registration.tNumber)) {
      deps.store.setDomainVerified(registration.id, "fixture");
      return c.json({ ok: true, method: "fixture" });
    }
    const result = await deps.domain.verify({
      domain: registration.domain,
      tNumber: formatTNumber(registration.tNumber),
      nonce: registration.challenge,
      controller: registration.controller as Address,
    });
    if (!result.ok) throw new HttpError(422, `domain_${result.reason}`, "no valid domain proof found yet");
    deps.store.setDomainVerified(registration.id, result.method);
    return c.json({ ok: true, method: result.method });
  });

  /** Step 3: each officer creates a World ID session bound to this registration. */
  app.post("/:id/officers", async (c) => {
    const registration = load(c.req.param("id"));
    const { result } = proofBody.parse(await c.req.json());
    const session = await deps.world.verify(result, enrollmentSignal(registration.id));
    if (!deps.store.consumeNullifier(session.sessionNullifier, `enroll:${registration.id}`)) {
      throw new HttpError(409, "proof_replayed", "this proof was already used");
    }
    deps.store.addOfficer(registration.id, registration.tNumber, session);
    return c.json({ officerId: session.officerId, officers: deps.store.officersOf(registration.id).length });
  });

  /** Step 4: the attester writes it on-chain, or files a dispute if the T-number is already claimed. */
  app.post("/:id/submit", async (c) => {
    const registration = load(c.req.param("id"));
    const { threshold } = submitBody.parse(await c.req.json());
    if (registration.outcome) throw new HttpError(409, "already_submitted", `already ${registration.outcome}`);
    if (!registration.domainMethod) throw new HttpError(409, "domain_not_verified", "verify the domain first");
    const officers = sortOfficerIds(deps.store.officersOf(registration.id).map((o) => o.officerId as Hex));
    if (officers.length === 0) throw new HttpError(409, "no_officers", "enroll at least one officer");
    if (threshold > officers.length) throw new HttpError(400, "invalid_threshold", "threshold exceeds officers");

    const tNumber = toChainId(registration.tNumber);
    const fixture = isFixture(deps, registration.tNumber) ? FIXTURE_EVIDENCE : undefined;
    const evidence = keccak256(toBytes(JSON.stringify({ ...registration, officers, threshold, fixture })));
    const current = await deps.chain.payee(tNumber);
    const outcome = current.status === 0 ? "registered" : "disputed";
    if (outcome === "disputed" && current.controller === getAddress(registration.controller)) {
      throw new HttpError(409, "already_registered", "this business already controls the payee");
    }
    const txHash =
      outcome === "registered"
        ? await deps.chain.register({ ...registrationArgs(registration), officers, threshold, evidence, tNumber })
        : await deps.chain.fileDispute(tNumber, registration.controller as Address, evidence);
    deps.store.setOutcome(registration.id, outcome, txHash);
    return c.json({ outcome, txHash, tNumber: formatTNumber(registration.tNumber) });
  });

  return app;
}

function registrationArgs(r: RegistrationRecord) {
  return { legalName: r.legalName, controller: r.controller as Address, payout: r.payout as Address };
}

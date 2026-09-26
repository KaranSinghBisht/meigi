import { Hono, type Context } from "hono";
import { getAddress, type Address } from "viem";
import { z } from "zod";
import { nowSeconds, type AppDeps } from "../deps.js";
import { domainProofMessage, normalizeDomain, TXT_PREFIX, txtRecordName } from "../domain/proof.js";
import { isFixture } from "../fixtures.js";
import { HttpError } from "../http.js";
import { checkOfficerLimits, isExpired, MAX_OFFICERS } from "../limits/officers.js";
import { policyOf } from "../limits/policy.js";
import type { RateLimiter } from "../limits/rate.js";
import { checkRegisteredName } from "../nta/corporations.js";
import { queueForWindow } from "../pending/window.js";
import { plannedOutcome, submitOnChain } from "../registry/submit.js";
import type { RegistrationRecord } from "../store/db.js";
import { formatTNumber } from "../tnumber.js";
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

/** Where a registration stands, as GET /registrations/:id reports it. */
function stateOf(deps: AppDeps, r: RegistrationRecord): string {
  if (r.outcome) return r.outcome;
  if (r.review === "rejected" || r.review?.startsWith("failed:")) return r.review.split(":")[0]!;
  if (r.review === "objected") return "under_review";
  if (r.claimedAt !== null) return "submitting";
  if (r.submitAfter !== null) return "pending_public_window";
  return !isFixture(deps, r.tNumber) && isExpired(r, policyOf(deps), nowSeconds(deps)) ? "expired" : "open";
}

export function registrationRoutes(deps: AppDeps, limiter: RateLimiter) {
  const app = new Hono();
  const policy = policyOf(deps);
  const client = (c: Context) => (deps.clientIp ? deps.clientIp(c) : "unknown");

  function load(id: string): RegistrationRecord {
    const registration = deps.store.getRegistration(id);
    if (!registration) throw new HttpError(404, "registration_not_found", "unknown registration");
    return registration;
  }

  /**
   * A registration that can still change: not submitted, being submitted or queued, and not expired (fixtures never
   * expire). Handlers call it again after every await, so a step that raced a submission can't change it afterwards.
   */
  function loadOpen(id: string): RegistrationRecord {
    const registration = load(id);
    if (registration.outcome || registration.submitAfter !== null || registration.claimedAt !== null || registration.review) {
      throw new HttpError(409, "already_submitted", `already ${stateOf(deps, registration).replaceAll("_", " ")}`);
    }
    if (!isFixture(deps, registration.tNumber) && isExpired(registration, policy, nowSeconds(deps))) {
      throw new HttpError(410, "registration_expired", "this registration expired; start a new one");
    }
    return registration;
  }

  /** Step 1: exact NTA match, then a domain-proof challenge for the controller wallet to sign. */
  app.post("/", async (c) => {
    const body = createBody.parse(await c.req.json());
    const digits = requireDigits(body.tNumber);
    // Every attempt counts, failed NTA matches included. Fictional fixtures can't squat anyone, so demos are exempt.
    if (!isFixture(deps, digits)) {
      limiter.hit("registrations", client(c), policy.ratePerHour.registrations, nowSeconds(deps));
    }
    const domain = normalizeDomain(body.domain);
    if (!domain) throw new HttpError(400, "invalid_domain", "expected a public domain name like example.co.jp");
    const name = registeredName(deps, digits, body.legalName);
    if (!name.ok) return c.json(name.body, 422);
    const input = {
      tNumber: digits,
      legalName: name.legalName,
      domain,
      controller: getAddress(body.controller),
      payout: getAddress(body.payout),
    };
    const { id, challenge } = deps.store.createRegistration(input, nowSeconds(deps) * 1000);
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

  /** Where a registration stands. The id is the caller's capability, so this shows no officer data either. */
  app.get("/:id", (c) => {
    const r = load(c.req.param("id"));
    const state = stateOf(deps, r);
    return c.json({ id: r.id, tNumber: formatTNumber(r.tNumber), state, submitAfter: r.submitAfter, txHash: r.txHash });
  });

  /** Step 2: the signed challenge is published in DNS (or .well-known). */
  app.post("/:id/domain", async (c) => {
    const registration = loadOpen(c.req.param("id"));
    if (isFixture(deps, registration.tNumber)) {
      deps.store.setDomainVerified(registration.id, "fixture");
      return c.json({ ok: true, method: "fixture" });
    }
    // Every attempt counts: this is a real outbound DNS/HTTPS fetch to a host the registration's own domain field
    // named, and the same registration can be re-checked any number of times, so the fan-out is otherwise unbounded.
    limiter.hit("domain", client(c), policy.ratePerHour.domain, nowSeconds(deps));
    const result = await deps.domain.verify({
      domain: registration.domain,
      tNumber: formatTNumber(registration.tNumber),
      nonce: registration.challenge,
      controller: registration.controller as Address,
    });
    if (!result.ok) throw new HttpError(422, `domain_${result.reason}`, "no valid domain proof found yet");
    loadOpen(registration.id); // still open after the await
    deps.store.setDomainVerified(registration.id, result.method);
    return c.json({ ok: true, method: result.method });
  });

  /** Step 3: each officer creates a World ID session bound to this registration, within the per-human limits. */
  app.post("/:id/officers", async (c) => {
    const id = c.req.param("id");
    loadOpen(id);
    const { result } = proofBody.parse(await c.req.json());
    limiter.hit("officers", client(c), policy.ratePerHour.officers, nowSeconds(deps)); // calls World's real verify API next
    const session = await deps.world.verify(result, enrollmentSignal(id));
    const registration = loadOpen(id); // still open after the await; from here on nothing awaits
    const enrolled = deps.store.officersOf(id).map((o) => o.officerId);
    if (enrolled.length >= MAX_OFFICERS && !enrolled.includes(session.officerId)) {
      throw new HttpError(409, "too_many_officers", `a company can have at most ${MAX_OFFICERS} officers`);
    }
    checkOfficerLimits(deps, registration, session.officerId, policy, nowSeconds(deps));
    if (!deps.store.consumeNullifier(session.sessionNullifier, `enroll:${registration.id}`)) {
      throw new HttpError(409, "proof_replayed", "this proof was already used");
    }
    deps.store.addOfficer(registration.id, registration.tNumber, session);
    return c.json({
      officerId: session.officerId,
      officers: deps.store.officersOf(registration.id).length,
      sybilScore: session.sybilScore ?? null,
    });
  });

  /**
   * Step 4: the attester writes it on-chain, or files a dispute if the T-number is already claimed. With a public
   * window configured, a non-fixture registration is queued instead and listed at GET /registrations/pending.
   */
  app.post("/:id/submit", async (c) => {
    const { threshold } = submitBody.parse(await c.req.json());
    const registration = loadOpen(c.req.param("id"));
    if (!registration.domainMethod) throw new HttpError(409, "domain_not_verified", "verify the domain first");
    const officers = deps.store.officersOf(registration.id).length;
    if (officers === 0) throw new HttpError(409, "no_officers", "enroll at least one officer");
    if (threshold > officers) throw new HttpError(400, "invalid_threshold", "threshold exceeds officers");

    // Claimed before the first await: a second submit, or an officer or domain step that raced it, gets 409.
    if (!deps.store.claimForSubmission(registration.id, nowSeconds(deps))) {
      throw new HttpError(409, "already_submitted", "this registration is already being submitted");
    }
    try {
      return await submit(c, registration, threshold);
    } catch (error) {
      deps.store.releaseClaim(registration.id); // nothing was written on-chain, or the write failed: retryable
      throw error;
    }
  });

  async function submit(c: Context, registration: RegistrationRecord, threshold: number) {
    const fixture = isFixture(deps, registration.tNumber);
    const outcome = await plannedOutcome(deps, registration);
    if (outcome === "disputed" && !fixture) {
      limiter.hit("disputes", client(c), policy.ratePerHour.disputes, nowSeconds(deps));
    }
    if (policy.pendingHours > 0 && !fixture) {
      return c.json(queueForWindow(deps, registration, threshold, policy.pendingHours), 202);
    }
    const { txHash } = await submitOnChain(deps, registration, threshold, outcome);
    return c.json({ outcome, txHash, tNumber: formatTNumber(registration.tNumber) });
  }

  return app;
}

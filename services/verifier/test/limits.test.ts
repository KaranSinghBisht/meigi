import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import type { Context } from "hono";
import { clientIpOf } from "../src/limits/client-ip.js";
import { ipKey } from "../src/limits/rate.js";
import type { Corporation } from "../src/nta/corporations.js";
import { enrollmentSignal } from "../src/routes/registrations.js";
import { hasCorporateCheckDigit } from "../src/tnumber.js";
import { officerIdFor } from "../src/world/session.js";
import { CONTROLLER, CURVEGRID_LEI, FakeChain, PAYOUT, curvegrid, fakeDeps, proof, sessionId } from "./fakes.js";

/** Five real-looking corporations (fictional numbers outside office 9999), each with its NTA name. */
const COMPANIES: Corporation[] = ["1010001000001", "1010001000002", "1010001000003", "1010001000004", "1010001000005"].map(
  (number, i) => ({ ...curvegrid, number, name: `株式会社テスト${i + 1}`, enName: "" }),
);

/** An office-9999 fixture number with a valid check digit, e.g. fixtureNumber(2) = "T7999900000002". */
function fixtureNumber(n: number): string {
  const base = `9999${String(n).padStart(8, "0")}`;
  const digit = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => hasCorporateCheckDigit(`${d}${base}`))!;
  return `T${digit}${base}`;
}

let chain: FakeChain;
let deps: AppDeps;
let app: ReturnType<typeof createApp>;
const clock = { now: 1_790_000_000 };
let nullifier = 0;

function setup(overrides: Partial<AppDeps> = {}) {
  chain = new FakeChain();
  deps = {
    ...fakeDeps(chain, clock),
    corporations: {
      byNumber: (d) => COMPANIES.find((c) => c.number === d) ?? null,
      byNameKey: () => [],
    },
    domain: { verify: async () => ({ ok: true, method: "dns" }) },
    clientIp: (c) => c.req.header("x-client-ip") ?? "203.0.113.1",
    ...overrides,
  };
  app = createApp(deps);
}

async function post(path: string, body: unknown, ip?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(ip ? { "x-client-ip": ip } : {}) };
  const res = await app.request(path, { method: "POST", body: JSON.stringify(body), headers });
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

async function get(path: string, ip?: string) {
  const headers: Record<string, string> = ip ? { "x-client-ip": ip } : {};
  const res = await app.request(path, { headers });
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

/** Starts a registration for company `i` (or a fixture number) and verifies its domain. */
async function start(tNumber: string, legalName: string, ip?: string) {
  const created = await post("/registrations", { tNumber, legalName, domain: "example.co.jp", controller: CONTROLLER, payout: PAYOUT }, ip);
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  await post(`/registrations/${id}/domain`, {});
  return id;
}

const company = (i: number) => start(`T${COMPANIES[i]!.number}`, COMPANIES[i]!.name);

async function enroll(id: string, human: string) {
  return post(`/registrations/${id}/officers`, { result: proof(sessionId(human), `0x${(++nullifier).toString(16)}`, enrollmentSignal(id)) });
}

beforeEach(() => {
  clock.now = 1_790_000_000;
  setup();
});

describe("per-human limits", () => {
  it("lets one World ID be an officer of at most 3 companies", async () => {
    for (const i of [0, 1, 2]) expect((await enroll(await company(i), "a")).status).toBe(200);
    const fourth = await enroll(await company(3), "a");
    expect(fourth).toMatchObject({ status: 409, body: { code: "officer_limit" } });
    expect((await enroll(await company(3), "b")).status).toBe(200); // another human is unaffected
  });

  it("allows one open registration per T-number per World ID, until it is submitted or expires", async () => {
    const first = await company(0);
    expect((await enroll(first, "a")).status).toBe(200);
    const second = await company(0);
    expect(await enroll(second, "a")).toMatchObject({ status: 409, body: { code: "duplicate_open_registration" } });
    expect((await enroll(second, "b")).status).toBe(200); // another human may still claim it

    clock.now += 25 * 3600; // both expire unsubmitted: they no longer block, and can't be submitted
    expect((await enroll(await company(0), "a")).status).toBe(200);
    expect(await post(`/registrations/${first}/submit`, { threshold: 1 })).toMatchObject({ status: 410, body: { code: "registration_expired" } });
  });

  it("frees the T-number for the same human once their registration is submitted", async () => {
    const first = await company(0);
    await enroll(first, "a");
    expect((await post(`/registrations/${first}/submit`, { threshold: 1 })).body.outcome).toBe("registered");
    expect((await enroll(await company(0), "a")).status).toBe(200);
  });

  it("counts a claim that became a dispute: the same human can't file a second claim on that number", async () => {
    await chain.register({ tNumber: BigInt(COMPANIES[0]!.number), legalName: "x", controller: "0x9999999999999999999999999999999999999999", payout: PAYOUT, officers: [], threshold: 1, evidence: "0x00" });
    const first = await company(0);
    await enroll(first, "a");
    expect((await post(`/registrations/${first}/submit`, { threshold: 1 })).body.outcome).toBe("disputed");
    expect(await enroll(await company(0), "a")).toMatchObject({ status: 409, body: { code: "duplicate_open_registration" } });
  });

  it("caps a company at the registry's 8 officers", async () => {
    const id = await company(0);
    for (const human of "abcdefgh") expect((await enroll(id, human)).status).toBe(200);
    expect(await enroll(id, "i")).toMatchObject({ status: 409, body: { code: "too_many_officers" } });
  });

  it("leaves fictional fixtures (office 9999) out, so demos can repeat", async () => {
    setup({ fixtures: true });
    for (const n of [1, 2, 3, 4, 5, 5]) {
      const id = await start(fixtureNumber(n), "株式会社メイギ試験");
      expect((await enroll(id, "a")).status).toBe(200);
    }
    expect((await enroll(await company(0), "a")).status).toBe(200); // fixtures didn't count toward the limit
  });
});

describe("disputes", () => {
  const other = "0x9999999999999999999999999999999999999999";

  it("never files a second dispute on a payee that is already disputed (it would restart the freeze)", async () => {
    await chain.register({ tNumber: BigInt(COMPANIES[0]!.number), legalName: "x", controller: other, payout: PAYOUT, officers: [], threshold: 1, evidence: "0x00" });
    chain.payees.get(BigInt(COMPANIES[0]!.number))!.status = 2;
    const id = await company(0);
    await enroll(id, "a");
    expect(await post(`/registrations/${id}/submit`, { threshold: 1 })).toMatchObject({ status: 409, body: { code: "already_disputed" } });
    expect(chain.calls.filter((call) => call.startsWith("dispute:"))).toEqual([]);
    expect((await post(`/registrations/${id}/submit`, { threshold: 1 })).body.code).toBe("already_disputed"); // claim was released
  });

  it("still lets a fictional fixture be disputed again, for repeatable demos", async () => {
    setup({ fixtures: true });
    const fixture = fixtureNumber(2);
    await chain.register({ tNumber: BigInt(fixture.slice(1)), legalName: "x", controller: other, payout: PAYOUT, officers: [], threshold: 1, evidence: "0x00" });
    chain.payees.get(BigInt(fixture.slice(1)))!.status = 2;
    const id = await start(fixture, "株式会社メイギ試験");
    await enroll(id, "a");
    expect((await post(`/registrations/${id}/submit`, { threshold: 1 })).body.outcome).toBe("disputed");
  });
});

describe("a registration being submitted is frozen", () => {
  it("writes it on-chain once when two submits race", async () => {
    const id = await company(0);
    await enroll(id, "a");
    const [one, two] = await Promise.all([
      post(`/registrations/${id}/submit`, { threshold: 1 }),
      post(`/registrations/${id}/submit`, { threshold: 1 }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect(chain.calls.filter((call) => call.startsWith("register:"))).toHaveLength(1);
  });

  it("refuses an officer whose proof was still being checked when the registration was submitted", async () => {
    const id = await company(0);
    await enroll(id, "a");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const verify = deps.world.verify;
    deps.world.verify = async (result, signal) => (await gate, verify(result, signal));
    const late = enroll(id, "b"); // its World ID check is still in flight...
    expect((await post(`/registrations/${id}/submit`, { threshold: 1 })).status).toBe(200); // ...when this lands
    release();
    expect(await late).toMatchObject({ status: 409, body: { code: "already_submitted" } });
    expect(chain.calls[0]).toBe(`register:${COMPANIES[0]!.number}:1:${officerIdFor(sessionId("a"))}`);
  });
});

describe("rate limits per client IP", () => {
  const body = { tNumber: `T${COMPANIES[0]!.number}`, legalName: COMPANIES[0]!.name, domain: "example.co.jp", controller: CONTROLLER, payout: PAYOUT };

  it("allows 10 new registrations an hour per IP, then answers 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i++) expect((await post("/registrations", body, "198.51.100.7")).status).toBe(201);
    const limited = await post("/registrations", body, "198.51.100.7");
    expect(limited).toMatchObject({ status: 429, body: { code: "rate_limited" } });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await post("/registrations", body, "198.51.100.8")).status).toBe(201); // another client

    clock.now += 3600;
    expect((await post("/registrations", body, "198.51.100.7")).status).toBe(201);
  });

  it("counts failed attempts too, so the NTA match can't be probed without limit", async () => {
    setup({ policy: { ratePerHour: { registrations: 2 } } });
    const wrongName = { ...body, legalName: "株式会社ちがう" };
    expect((await post("/registrations", wrongName)).status).toBe(422);
    expect((await post("/registrations", wrongName)).status).toBe(422);
    expect((await post("/registrations", body)).status).toBe(429);
  });

  it("limits disputes filed against already-claimed numbers", async () => {
    await chain.register({ tNumber: BigInt(COMPANIES[0]!.number), legalName: "x", controller: "0x9999999999999999999999999999999999999999", payout: PAYOUT, officers: [], threshold: 1, evidence: "0x00" });
    for (const human of ["a", "b", "c"]) {
      const id = await company(0);
      await enroll(id, human);
      expect((await post(`/registrations/${id}/submit`, { threshold: 1 })).body.outcome).toBe("disputed");
    }
    const id = await company(0);
    await enroll(id, "d");
    expect(await post(`/registrations/${id}/submit`, { threshold: 1 })).toMatchObject({ status: 429, body: { code: "rate_limited" } });
    expect(chain.calls.filter((call) => call.startsWith("dispute:"))).toHaveLength(3);
  });

  it("don't apply to fictional fixtures, so demos from localhost can repeat", async () => {
    setup({ fixtures: true });
    const fixture = { ...body, tNumber: fixtureNumber(2), legalName: "株式会社メイギ試験" };
    for (let i = 0; i < 15; i++) expect((await post("/registrations", fixture)).status).toBe(201);
    expect((await post("/registrations", body)).status).toBe(201); // real numbers still have their own budget
  });

  it("can be turned off", async () => {
    setup({ policy: { ratePerHour: { registrations: 0 } } });
    for (let i = 0; i < 15; i++) expect((await post("/registrations", body)).status).toBe(201);
  });

  it("takes the client from the socket, and behind a trusted proxy only from the hop that proxy added", () => {
    const headers: Record<string, string> = { "x-forwarded-for": "192.0.2.50, 10.0.0.2", "cf-connecting-ip": "198.51.100.23" };
    const c = { env: { incoming: { socket: { remoteAddress: "::ffff:127.0.0.1" } } }, req: { header: (n: string) => headers[n] } };
    const ip = (trust: boolean) => clientIpOf(c as unknown as Context, trust);
    expect(ip(false)).toBe("127.0.0.1"); // without a trusted proxy, headers never pick the bucket
    expect(ip(true)).toBe("10.0.0.2"); // the entry our proxy appended; the client wrote everything to its left
    headers["x-forwarded-for"] = "1:2:3:4:5:6:7:8::9"; // not an address: fall back to the socket, never throw
    expect(ip(true)).toBe("127.0.0.1");
  });

  it("keys IPv6 clients by their /64 and unwraps IPv4-mapped addresses", () => {
    expect(ipKey("203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:DB8:1:2::99")).toBe(ipKey("2001:db8:1:2:ffff::1"));
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipKey("1:2:3:4:5:6:7:8::9")).toBe("invalid");
  });
});

describe("rate limits on the domain re-check and the public lookups", () => {
  it("limits POST /registrations/:id/domain per IP: it makes a real outbound fetch on every call, even after it succeeds", async () => {
    setup({ policy: { ratePerHour: { domain: 2 } } });
    const created = await post("/registrations", {
      tNumber: `T${COMPANIES[0]!.number}`,
      legalName: COMPANIES[0]!.name,
      domain: "example.co.jp",
      controller: CONTROLLER,
      payout: PAYOUT,
    });
    const id = created.body.id as string;
    expect((await post(`/registrations/${id}/domain`, {})).status).toBe(200);
    expect((await post(`/registrations/${id}/domain`, {})).status).toBe(200); // re-checking an already-verified domain still counts
    const limited = await post(`/registrations/${id}/domain`, {});
    expect(limited).toMatchObject({ status: 429, body: { code: "rate_limited" } });
  });

  it("doesn't limit the domain re-check for fictional fixtures, since they never make the real outbound call", async () => {
    setup({ fixtures: true, policy: { ratePerHour: { domain: 1 } } });
    const created = await post("/registrations", {
      tNumber: fixtureNumber(2),
      legalName: "株式会社メイギ試験",
      domain: "meigi.example",
      controller: CONTROLLER,
      payout: PAYOUT,
    });
    const id = created.body.id as string;
    for (let i = 0; i < 5; i++) expect((await post(`/registrations/${id}/domain`, {})).status).toBe(200);
  });

  it("limits the public lookup GETs per IP: NTA, payees, LEI (which proxies GLEIF), and the rp_context signer", async () => {
    setup({ policy: { ratePerHour: { nta: 2, payees: 2, lei: 2, rpContext: 2 } } });
    const tNumber = `T${COMPANIES[0]!.number}`;

    expect((await get(`/nta/${tNumber}`)).status).toBe(200);
    expect((await get(`/nta/${tNumber}`)).status).toBe(200);
    expect(await get(`/nta/${tNumber}`)).toMatchObject({ status: 429, body: { code: "rate_limited" } });

    expect((await get(`/payees/${tNumber}`)).status).toBe(200);
    expect((await get(`/payees/${tNumber}`)).status).toBe(200);
    expect(await get(`/payees/${tNumber}`)).toMatchObject({ status: 429, body: { code: "rate_limited" } });

    expect((await get(`/lei/${CURVEGRID_LEI}`)).status).toBe(200);
    expect((await get(`/lei/${CURVEGRID_LEI}`)).status).toBe(200);
    expect(await get(`/lei/${CURVEGRID_LEI}`)).toMatchObject({ status: 429, body: { code: "rate_limited" } });

    expect((await get("/world/rp-context")).status).toBe(200);
    expect((await get("/world/rp-context")).status).toBe(200);
    expect(await get("/world/rp-context")).toMatchObject({ status: 429, body: { code: "rate_limited" } });
  });

  it("keys each lookup route under its own budget, per client IP", async () => {
    setup({ policy: { ratePerHour: { nta: 1 } } });
    const tNumber = `T${COMPANIES[0]!.number}`;
    expect((await get(`/nta/${tNumber}`, "198.51.100.9")).status).toBe(200);
    expect(await get(`/nta/${tNumber}`, "198.51.100.9")).toMatchObject({ status: 429, body: { code: "rate_limited" } });
    expect((await get(`/nta/${tNumber}`, "198.51.100.10")).status).toBe(200); // a different client, its own budget
    expect((await get(`/payees/${tNumber}`, "198.51.100.9")).status).toBe(200); // a different route, its own budget
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import type { Context } from "hono";
import { clientIpOf } from "../src/limits/client-ip.js";
import { ipKey } from "../src/limits/rate.js";
import type { Corporation } from "../src/nta/corporations.js";
import { enrollmentSignal } from "../src/routes/registrations.js";
import { hasCorporateCheckDigit } from "../src/tnumber.js";
import { CONTROLLER, FakeChain, PAYOUT, curvegrid, fakeDeps, proof, sessionId } from "./fakes.js";

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

  it("leaves fictional fixtures (office 9999) out, so demos can repeat", async () => {
    setup({ fixtures: true });
    for (const n of [1, 2, 3, 4, 5, 5]) {
      const id = await start(fixtureNumber(n), "株式会社メイギ試験");
      expect((await enroll(id, "a")).status).toBe(200);
    }
    expect((await enroll(await company(0), "a")).status).toBe(200); // fixtures didn't count toward the limit
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

  it("can be turned off", async () => {
    setup({ policy: { ratePerHour: { registrations: 0 } } });
    for (let i = 0; i < 15; i++) expect((await post("/registrations", body)).status).toBe(201);
  });

  it("takes the client from the socket, and from forwarded headers only behind a trusted proxy", () => {
    const headers: Record<string, string> = { "x-forwarded-for": "192.0.2.50, 10.0.0.2" };
    const c = { env: { incoming: { socket: { remoteAddress: "::ffff:127.0.0.1" } } }, req: { header: (n: string) => headers[n] } };
    expect(clientIpOf(c as unknown as Context, false)).toBe("127.0.0.1"); // a client can't pick its own bucket
    expect(clientIpOf(c as unknown as Context, true)).toBe("192.0.2.50");
    headers["cf-connecting-ip"] = "198.51.100.23";
    expect(clientIpOf(c as unknown as Context, true)).toBe("198.51.100.23");
  });

  it("keys IPv6 clients by their /64 and unwraps IPv4-mapped addresses", () => {
    expect(ipKey("203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(ipKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(ipKey("2001:DB8:1:2::99")).toBe(ipKey("2001:db8:1:2:ffff::1"));
    expect(ipKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
});

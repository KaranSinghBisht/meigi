import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { enrollmentSignal } from "../src/routes/registrations.js";
import { hasCorporateCheckDigit, isUnassignableOffice } from "../src/tnumber.js";
import { CONTROLLER, FakeChain, PAYOUT, fakeDeps, proof, sessionId } from "./fakes.js";

// Registry office 9999 is never issued, so these can't belong to a real company. The first has a valid check digit.
const FIXTURE = "T7999900000002";
const BAD_CHECK_DIGIT = "T1999900000002";

function appWith(fixtures: boolean) {
  const chain = new FakeChain();
  const app = createApp({ ...fakeDeps(chain, { now: 1_790_000_000 }), fixtures });
  async function post(path: string, body: unknown) {
    const init = { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } };
    const res = await app.request(path, init);
    return { status: res.status, body: (await res.json()) as Record<string, any> };
  }
  const register = (tNumber: string) =>
    post("/registrations", { tNumber, legalName: " 株式会社メイギ試験 ", domain: "meigi.example", controller: CONTROLLER, payout: PAYOUT });
  return { app, chain, post, register };
}

describe("fictional demo fixtures (registry office 9999)", () => {
  it("only numbers in office 9999 with a valid check digit qualify", () => {
    expect(isUnassignableOffice(FIXTURE.slice(1)) && hasCorporateCheckDigit(FIXTURE.slice(1))).toBe(true);
    expect(hasCorporateCheckDigit(BAD_CHECK_DIGIT.slice(1))).toBe(false);
    expect(isUnassignableOffice("2011001234567")).toBe(false);
  });

  it("register end to end without an NTA record or domain proof, and are reported as fixtures", async () => {
    const { app, chain, post, register } = appWith(true);
    expect((await (await app.request(`/nta/${FIXTURE}`)).json()).fixture).toBe(true);

    const created = await register(FIXTURE);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ fixture: true, legalName: "株式会社メイギ試験" });
    const id = created.body.id as string;
    expect((await post(`/registrations/${id}/domain`, {})).body).toEqual({ ok: true, method: "fixture" });
    const officer = await post(`/registrations/${id}/officers`, { result: proof(sessionId("f"), "0x21", enrollmentSignal(id)) });
    expect(officer.status).toBe(200);
    const submitted = await post(`/registrations/${id}/submit`, { threshold: 1 });
    expect(submitted.body).toMatchObject({ outcome: "registered", tNumber: FIXTURE });
    expect(chain.calls.some((call) => call.startsWith("register:7999900000002:1:"))).toBe(true);
  });

  it("still requires the NTA match when fixtures are off, for real-range numbers, and for bad check digits", async () => {
    const off = appWith(false);
    expect((await (await off.app.request(`/nta/${FIXTURE}`)).json()).fixture).toBe(false);
    expect((await off.register(FIXTURE)).body.code).toBe("nta_not_found");

    const on = appWith(true);
    expect((await on.register("T2011001234567")).body.code).toBe("nta_not_found");
    expect((await on.register(BAD_CHECK_DIGIT)).body.code).toBe("nta_not_found");
  });
});

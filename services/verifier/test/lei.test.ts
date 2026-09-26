import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { gleifRegistry, parseLei } from "../src/lei/lei.js";
import { CURVEGRID_LEI, FakeChain, fakeDeps, fakeLei } from "./fakes.js";

// Real LEIs from GLEIF (checked 2026-09-26): Sony Group (JP), Toyota Motor Asia (SG), Apple Operations Intl (IE).
const SONY = "529900R5WX9N2OI2N910";
const TOYOTA_SG = "2549007SWUPLDICDFN48";
const APPLE_IE = "549300G81RQKP7XW2N18";

describe("parseLei", () => {
  it("accepts real LEIs, normalising case and spaces", () => {
    for (const lei of [SONY, TOYOTA_SG, APPLE_IE]) expect(parseLei(lei)).toBe(lei);
    expect(parseLei(" 5299 00r5wx9n2oi2n910 ")).toBe(SONY);
  });

  it("rejects wrong check digits and malformed codes", () => {
    expect(parseLei("529900R5WX9N2OI2N911")).toBeNull(); // last digit changed
    expect(parseLei("529900R5WX9N2OI2N9")).toBeNull(); // too short
    expect(parseLei("529900R5WX9N2OI2N9AA")).toBeNull(); // check digits must be digits
    expect(parseLei("529900R5WX9N2OI2N9-0")).toBeNull();
  });
});

function gleifBody(id: string) {
  return {
    data: {
      id,
      attributes: {
        entity: {
          legalName: { name: "ソニーグループ株式会社", language: "ja" },
          otherNames: [{ name: "Sony Group Corporation", language: "en" }],
          transliteratedOtherNames: [{ name: "SONY GROUP KABUSHIKI KAISHA", language: "ja-Latn" }],
          jurisdiction: "JP",
          legalAddress: { city: "港区", country: "JP" },
          status: "ACTIVE",
        },
        registration: { status: "ISSUED", nextRenewalDate: "2027-03-01T00:00:00Z" },
      },
    },
  };
}

describe("gleifRegistry", () => {
  it("maps GLEIF's JSON:API record", async () => {
    const calls: { url: string; accept: string | null }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, accept: new Headers(init?.headers).get("accept") });
      return new Response(JSON.stringify(gleifBody(SONY)), { status: 200 });
    }) as typeof fetch;
    const record = await gleifRegistry(fetchImpl, "https://gleif.test/api/v1").lookup(SONY);
    expect(calls[0]).toEqual({ url: `https://gleif.test/api/v1/lei-records/${SONY}`, accept: "application/vnd.api+json" });
    expect(record).toMatchObject({
      lei: SONY,
      legalName: "ソニーグループ株式会社",
      otherNames: ["Sony Group Corporation", "SONY GROUP KABUSHIKI KAISHA"],
      country: "JP",
      entityStatus: "ACTIVE",
      registrationStatus: "ISSUED",
    });
  });

  it("returns null for an unknown LEI and throws when GLEIF fails", async () => {
    const answer = (status: number) => (async () => new Response("{}", { status })) as unknown as typeof fetch;
    await expect(gleifRegistry(answer(404)).lookup(SONY)).resolves.toBeNull();
    await expect(gleifRegistry(answer(503)).lookup(SONY)).rejects.toThrow("HTTP 503");
  });
});

describe("GET /lei/:lei", () => {
  const clock = { now: 1_790_000_000 };

  it("returns the record and links a Japanese entity to its T-number by exact (NFKC) name", async () => {
    const app = createApp(fakeDeps(new FakeChain(), clock));
    const response = await app.request(`/lei/${CURVEGRID_LEI.toLowerCase()}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ lei: CURVEGRID_LEI, active: true, country: "JP" });
    // GLEIF writes "Curvegrid株式会社"; the NTA writes full-width "Ｃｕｒｖｅｇｒｉｄ株式会社". NFKC makes them equal.
    expect(body.ntaMatches).toEqual([{ tNumber: "T1010601051968", name: "Ｃｕｒｖｅｇｒｉｄ株式会社" }]);
  });

  it("refuses bad check digits, reports unknown LEIs, and fails closed when GLEIF is down", async () => {
    const app = createApp(fakeDeps(new FakeChain(), clock));
    expect((await app.request("/lei/529900R5WX9N2OI2N911")).status).toBe(400);
    const unknown = await app.request(`/lei/${SONY}`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: "lei_not_found" });

    const down = createApp({ ...fakeDeps(new FakeChain(), clock), lei: fakeLei({}, true) });
    const response = await down.request(`/lei/${SONY}`);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "lei_unavailable" });
  });
});

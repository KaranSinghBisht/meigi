import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { AppDeps } from "../src/deps.js";
import { submitDueRegistrations } from "../src/pending/window.js";
import { enrollmentSignal } from "../src/routes/registrations.js";
import { openStore } from "../src/store/db.js";
import { CONTROLLER, FakeChain, PAYOUT, fakeDeps, proof, sessionId } from "./fakes.js";

const DAY = 24 * 3600;
const clock = { now: 1_790_000_000 };
let chain: FakeChain;
let deps: AppDeps;
let app: ReturnType<typeof createApp>;
let nullifier = 0;

function setup(overrides: Partial<AppDeps> = {}) {
  chain = new FakeChain();
  deps = { ...fakeDeps(chain, clock), policy: { pendingHours: 24 }, ...overrides };
  app = createApp(deps);
}

async function call(method: string, path: string, body?: unknown) {
  const init = body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
  const res = await app.request(path, init);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

/** A registration that passed every check (Curvegrid, or a fixture), submitted with one officer. */
async function submitted(tNumber = "T1010601051968", legalName = "Curvegrid株式会社") {
  const created = await call("POST", "/registrations", { tNumber, legalName, domain: "curvegrid.co.jp", controller: CONTROLLER, payout: PAYOUT });
  const id = created.body.id as string;
  await call("POST", `/registrations/${id}/domain`, {});
  const human = proof(sessionId("e"), `0x${(++nullifier).toString(16)}`, enrollmentSignal(id));
  expect((await call("POST", `/registrations/${id}/officers`, { result: human })).status).toBe(200);
  return { id, response: await call("POST", `/registrations/${id}/submit`, { threshold: 1 }) };
}

beforeEach(() => {
  clock.now = 1_790_000_000;
  setup();
});

describe("public pending window (VERIFIER_PENDING_HOURS)", () => {
  it("queues a verified registration, lists it without officer data, and submits it after the window", async () => {
    const { id, response } = await submitted();
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ outcome: "pending_public_window", tNumber: "T1010601051968", submitAfter: clock.now + DAY });
    const publicId = response.body.publicId as string;
    expect(publicId).not.toBe(id); // the listing never reveals the registration's capability id
    expect(chain.calls).toEqual([]);

    const listed = await call("GET", "/registrations/pending");
    expect(listed.body).toEqual({
      windowHours: 24,
      registrations: [{ id: publicId, tNumber: "T1010601051968", legalName: "Ｃｕｒｖｅｇｒｉｄ株式会社", domain: "curvegrid.co.jp",
        createdAt: clock.now, submitAfter: clock.now + DAY, status: "pending" }],
    });
    const text = JSON.stringify(listed.body);
    for (const secret of [id, CONTROLLER, PAYOUT, sessionId("e")]) expect(text).not.toContain(secret);

    const late = proof(sessionId("f"), "0xff", enrollmentSignal(id));
    expect((await call("POST", `/registrations/${id}/officers`, { result: late })).body.code).toBe("already_submitted");
    expect((await call("GET", `/registrations/${id}`)).body.state).toBe("pending_public_window");

    clock.now += DAY - 1;
    expect(await submitDueRegistrations(deps)).toBe(0);
    clock.now += 1;
    expect(await submitDueRegistrations(deps)).toBe(1);
    expect(chain.calls).toHaveLength(1);
    expect(chain.calls[0]).toMatch(/^register:1010601051968:1:/u);
    expect((await call("GET", `/registrations/${id}`)).body).toMatchObject({ state: "registered", txHash: "0xabc1" });
    expect((await call("GET", "/registrations/pending")).body.registrations).toEqual([]);
  });

  it("holds a registration anyone objects to for manual review instead of submitting it", async () => {
    const { id, response } = await submitted();
    const publicId = response.body.publicId as string;
    expect((await call("POST", `/registrations/${id}/object`, { reason: "This is not our company's claim." })).status).toBe(404);
    expect((await call("POST", `/registrations/${publicId}/object`, { reason: "short" })).body.code).toBe("invalid_input");

    const objection = await call("POST", `/registrations/${publicId}/object`, { reason: "We are Curvegrid and did not file this.", contact: "legal@curvegrid.example" });
    expect(objection).toMatchObject({ status: 202, body: { id: publicId, status: "under_review" } });
    expect((await call("GET", "/registrations/pending")).body.registrations[0].status).toBe("under_review");
    expect((await call("GET", `/registrations/${id}`)).body.state).toBe("under_review");

    clock.now += 2 * DAY;
    expect(await submitDueRegistrations(deps)).toBe(0);
    expect(chain.calls).toEqual([]);
  });

  it("lets fixtures (office 9999) skip the window", async () => {
    setup({ fixtures: true, policy: { pendingHours: 24 } });
    const { response } = await submitted("T7999900000002", "株式会社メイギ試験");
    expect(response).toMatchObject({ status: 200, body: { outcome: "registered", txHash: "0xabc1" } });
  });

  it("submits at once when the window is 0 (the default)", async () => {
    setup({ policy: {} });
    const { response } = await submitted();
    expect(response).toMatchObject({ status: 200, body: { outcome: "registered", tNumber: "T1010601051968" } });
  });
});

describe("store migration", () => {
  it("adds the new columns to a database from before them, keeping its registrations", () => {
    const dir = mkdtempSync(join(tmpdir(), "verifier-"));
    try {
      const path = join(dir, "old.sqlite");
      const old = new DatabaseSync(path);
      old.exec(`CREATE TABLE registrations (
        id TEXT PRIMARY KEY, t_number TEXT NOT NULL, legal_name TEXT NOT NULL, domain TEXT NOT NULL,
        controller TEXT NOT NULL, payout TEXT NOT NULL, challenge TEXT NOT NULL,
        domain_method TEXT, outcome TEXT, tx_hash TEXT, created_at INTEGER NOT NULL)`);
      old.prepare("INSERT INTO registrations VALUES ('r1', '1010601051968', 'n', 'd.jp', 'c', 'p', 'x', NULL, NULL, NULL, 1790000000000)").run();
      old.close();

      const store = openStore(path);
      expect(store.getRegistration("r1")).toMatchObject({ id: "r1", createdAt: 1_790_000_000, submitAfter: null, review: null });
      expect(store.queueRegistration("r1", 1, 1_790_086_400)).toMatch(/^[0-9a-f]{24}$/u);
      expect(openStore(path).pendingRegistrations()).toHaveLength(1); // reopening is a no-op
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

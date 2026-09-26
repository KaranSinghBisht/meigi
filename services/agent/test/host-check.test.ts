import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { allowedHosts } from "../src/wiring.js";
import { demo, fakeDeps } from "./fakes.js";

/** Review L4: a DNS-rebinding page reaches 127.0.0.1 under its own host name; the agent must not answer it. */

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json", ...headers },
});

describe("host allow-list", () => {
  it.each(["http://localhost:8788", "http://127.0.0.1:8788", "http://[::1]:8788"])("answers on %s", async (origin) => {
    const res = await createApp(fakeDeps()).request(`${origin}/health`);
    expect(res.status).toBe(200);
  });

  it("refuses a rebinding page before any route runs: it can't analyze or pay", async () => {
    const deps = fakeDeps();
    const app = createApp(deps);
    const analysis = (await (await app.request("http://localhost:8788/invoices/analyze", json({ text: demo("01-routine-invoice.ja.txt") }))).json()) as {
      id: string;
      verdict: { decision: string };
    };
    expect(analysis.verdict.decision).toBe("pay");
    const evil = "http://rebind.attacker.example:8788";
    for (const res of [
      await app.request(`${evil}/health`),
      await app.request(`${evil}/invoices/analyze`, json({ text: demo("01-routine-invoice.ja.txt") })),
      await app.request(`${evil}/invoices/${analysis.id}/pay`, json({})),
    ]) {
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ code: "forbidden_host", message: "this agent answers only on localhost" });
    }
    expect(deps.payer.simulated).toEqual([]);
    expect(deps.payer.sent).toEqual([]);
  });

  it("checks the Host header too, not only the URL", async () => {
    const res = await createApp(fakeDeps()).request("http://localhost:8788/health", { headers: { host: "rebind.attacker.example:8788" } });
    expect(res.status).toBe(403);
  });

  it("takes extra names for LAN use from AGENT_ALLOWED_HOSTS", async () => {
    const hosts = allowedHosts(8788, "192.168.1.20:8788, agent.lan");
    expect(hosts).toEqual(expect.arrayContaining(["localhost:8788", "[::1]", "192.168.1.20:8788", "agent.lan"]));
    const res = await createApp({ ...fakeDeps(), allowedHosts: hosts }).request("http://192.168.1.20:8788/health");
    expect(res.status).toBe(200);
  });
});

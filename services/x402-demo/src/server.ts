import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { loadConfig } from "./config.js";
import { merchantApp } from "./merchant.js";
import { railOf } from "./rail.js";
import { runResearchAgent } from "./scenario.js";

const config = loadConfig();

const app = new Hono();
app.use("/scenario/*", cors({ origin: config.APP_ORIGINS.split(",").map((o) => o.trim()), allowMethods: ["POST"] }));
app.get("/health", (c) => c.json({ ok: true }));
app.route("/", merchantApp(config));

/** A research agent buying 2 GPU-minutes and a dataset slice, trying a compromised look-alike and an
 * undeclared source along the way. Returns the full step log; see scenario.ts. */
app.post("/scenario/research-agent", async (c) => c.json(await runResearchAgent(config)));

serve({ fetch: app.fetch, port: config.X402_DEMO_PORT, hostname: config.X402_DEMO_HOST }, (info) => {
  process.stdout.write(`meigi x402 demo (${railOf(config).network}) listening on http://localhost:${info.port}\n`);
});

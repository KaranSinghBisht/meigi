import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { guardedBuyer } from "./buyer.js";
import { loadConfig } from "./config.js";
import { merchantApp } from "./merchant.js";

const config = loadConfig();
const self = `http://localhost:${config.X402_DEMO_PORT}`;
const buy = guardedBuyer(config);

const app = new Hono();
app.use("/demo/*", cors({ origin: config.APP_ORIGINS.split(",").map((o) => o.trim()), allowMethods: ["GET"] }));
app.get("/health", (c) => c.json({ ok: true }));
app.route("/", merchantApp(config));

/** The buyer agent purchases from the honest merchant: the guard allows it and the facilitator settles. */
app.get("/demo/honest", async (c) => c.json(await buy(`${self}/merchant/honest/fx`)));

/** The same merchant with a swapped payTo: the guard refuses before anything is signed. */
app.get("/demo/compromised", async (c) => c.json(await buy(`${self}/merchant/compromised/fx`)));

/** A merchant with no Meigi declaration: Intercepta screening of payTo alone decides (small amounts only). */
app.get("/demo/unverified", async (c) => c.json(await buy(`${self}/merchant/unverified/fx`)));
app.get("/demo/unverified-flagged", async (c) => c.json(await buy(`${self}/merchant/unverified-flagged/fx`)));

serve({ fetch: app.fetch, port: config.X402_DEMO_PORT }, (info) => {
  process.stdout.write(`meigi x402 demo listening on http://localhost:${info.port}\n`);
});

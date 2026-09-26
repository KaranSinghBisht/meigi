import { meigiPayeeDeclaration } from "@meigi/x402-guard";
import type { RouteConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono, type Context } from "hono";
import {
  DATASET_SLICE_PRICE_YEN,
  GPU_INFERENCE_PRICE_YEN,
  GPU_MINUTE_PRICE_YEN,
  PRICE_YEN,
  type Config,
} from "./config.js";
import { facilitatorFor } from "./facilitator.js";
import { railOf, yen, type Rail } from "./rail.js";

/**
 * Two realistic x402 merchants, paid in JPY stablecoins, each with a compromised variant (the server swapped
 * `payTo`; an attacker can edit a web server, but not the company's registry entry or its ENS name):
 * - Minato GPU Cloud (`/compute/minato/*`) sells GPU-minutes and inference calls.
 * - Fuji Data (`/data/fuji/*`) sells slices of an invoice-OCR training dataset.
 * `/web/scrape/*` declares no Meigi payee, like most of the web today: a buyer can only judge it by screening
 * `payTo`, and only for small amounts.
 * On Awaji only Minato is registered, so only its routes are served, and they declare a T-number without an ENS name.
 */
export function merchantApp(config: Config) {
  const rail = railOf(config);
  const server = new x402ResourceServer(facilitatorFor(config, rail)).register(rail.network, new ExactEvmScheme());
  const route: Route = (payTo, priceYen, description, extensions) => ({
    accepts: {
      scheme: "exact",
      network: rail.network,
      payTo,
      price: { asset: rail.asset.address, extra: rail.asset.extra, amount: yen(rail, priceYen).toString() },
    },
    description,
    mimeType: "application/json",
    ...(extensions ? { extensions } : {}),
  });

  const app = new Hono();
  app.use(paymentMiddleware(routesFor(config, rail, route), server));

  const inference = (c: Context) =>
    c.json({ model: "minato-h100-70b", tokens: 842, latencyMs: 611, result: "(demo inference output)" });
  const gpuMinute = (c: Context) => c.json({ gpu: "H100 80GB", minutes: 1, jobId: crypto.randomUUID() });
  const dataset = (c: Context) =>
    c.json({ slice: c.req.param("slice"), rows: 5000, format: "parquet", schema: ["image_uri", "text", "amount_jpy"] });
  const scrape = (c: Context) => c.json({ query: "public sentiment", results: 20, source: "demo" });

  app.post("/compute/minato/inference", inference);
  app.post("/compute/minato/inference/compromised", inference);
  app.post("/compute/minato/gpu-minute", gpuMinute);
  if (rail.name === "sepolia") {
    app.get("/data/fuji/dataset/:slice", dataset);
    app.get("/data/fuji/dataset/:slice/compromised", dataset);
    app.get("/web/scrape/undeclared", scrape);
    app.get("/web/scrape/undeclared-flagged", scrape);
  }
  return app;
}

type Route = (payTo: string, priceYen: number, description: string, extensions?: Record<string, unknown>) => RouteConfig;

/** The paid routes. A declaration names the T-number, plus the payee's ENS name where ENS exists. */
function routesFor(config: Config, rail: Rail, route: Route): Record<string, RouteConfig> {
  const declare = (tNumber: string) => meigiPayeeDeclaration(tNumber, { ens: rail.ens });
  const minato = declare(config.DEMO_MINATO_T_NUMBER);
  const minatoPayout = minatoPayoutOn(config, rail);
  const routes: Record<string, RouteConfig> = {
    "POST /compute/minato/inference": route(minatoPayout, GPU_INFERENCE_PRICE_YEN, "GPU inference call (Minato GPU Cloud)", minato),
    "POST /compute/minato/inference/compromised": route(config.DEMO_SCAMMER, GPU_INFERENCE_PRICE_YEN, "GPU inference call (Minato GPU Cloud)", minato),
    "POST /compute/minato/gpu-minute": route(minatoPayout, GPU_MINUTE_PRICE_YEN, "1 GPU-minute, H100 (Minato GPU Cloud)", minato),
  };
  if (rail.name === "sepolia") {
    const fuji = declare(config.DEMO_MERCHANT_T_NUMBER);
    Object.assign(routes, {
      "GET /data/fuji/dataset/:slice": route(config.DEMO_MERCHANT_PAYOUT, DATASET_SLICE_PRICE_YEN, "Invoice-OCR dataset slice (Fuji Data)", fuji),
      "GET /data/fuji/dataset/:slice/compromised": route(config.DEMO_SCAMMER, DATASET_SLICE_PRICE_YEN, "Invoice-OCR dataset slice (Fuji Data)", fuji),
      "GET /web/scrape/undeclared": route(config.DEMO_UNVERIFIED_PAYTO ?? config.DEMO_MERCHANT_PAYOUT, PRICE_YEN, "Public web scrape (no Meigi record)"),
      "GET /web/scrape/undeclared-flagged": route(config.DEMO_FLAGGED_PAYTO, PRICE_YEN, "Public web scrape (no Meigi record)"),
    });
  }
  return routes;
}

/** Minato's honest payout: the one registered for its T-number on the rail's chain. */
function minatoPayoutOn(config: Config, rail: Rail): string {
  if (rail.name === "sepolia") return config.DEMO_MINATO_PAYOUT;
  if (!config.AWAJI_MINATO_PAYOUT) throw new Error("Awaji mode needs AWAJI_MINATO_PAYOUT, Minato's registered Awaji payout");
  return config.AWAJI_MINATO_PAYOUT;
}

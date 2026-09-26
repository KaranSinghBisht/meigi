import { meigiPayeeDeclaration } from "@meigi/x402-guard";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono, type Context } from "hono";
import {
  DATASET_SLICE_PRICE_ATOMIC,
  GPU_INFERENCE_PRICE_ATOMIC,
  GPU_MINUTE_PRICE_ATOMIC,
  NETWORK,
  PRICE_ATOMIC,
  type Config,
} from "./config.js";
import { localFacilitator } from "./facilitator.js";

/**
 * Two realistic x402 merchants, paid in (mock) JPYC, each with a compromised variant (the server swapped
 * `payTo`; an attacker can edit a web server, but not the company's registry entry or its ENS name):
 * - Minato GPU Cloud (`/compute/minato/*`) sells GPU-minutes and inference calls.
 * - Fuji Data (`/data/fuji/*`) sells slices of an invoice-OCR training dataset.
 * `/web/scrape/*` declares no Meigi payee, like most of the web today: a buyer can only judge it by screening
 * `payTo`, and only for small amounts.
 */
export function merchantApp(config: Config) {
  const server = new x402ResourceServer(localFacilitator(config)).register(NETWORK, new ExactEvmScheme());
  const asset = { asset: config.TOKEN_ADDRESS, extra: { name: "Mock JPY Coin", version: "1" } };
  const minato = meigiPayeeDeclaration(config.DEMO_MINATO_T_NUMBER);
  const fuji = meigiPayeeDeclaration(config.DEMO_MERCHANT_T_NUMBER);

  const route = (payTo: string, amount: string, description: string, extensions?: Record<string, unknown>) => ({
    accepts: { scheme: "exact", network: NETWORK, payTo, price: { ...asset, amount } },
    description,
    mimeType: "application/json",
    ...(extensions ? { extensions } : {}),
  });

  const app = new Hono();
  app.use(
    paymentMiddleware(
      {
        "POST /compute/minato/inference": route(config.DEMO_MINATO_PAYOUT, GPU_INFERENCE_PRICE_ATOMIC, "GPU inference call (Minato GPU Cloud)", minato),
        "POST /compute/minato/inference/compromised": route(config.DEMO_SCAMMER, GPU_INFERENCE_PRICE_ATOMIC, "GPU inference call (Minato GPU Cloud)", minato),
        "POST /compute/minato/gpu-minute": route(config.DEMO_MINATO_PAYOUT, GPU_MINUTE_PRICE_ATOMIC, "1 GPU-minute, H100 (Minato GPU Cloud)", minato),
        "GET /data/fuji/dataset/:slice": route(config.DEMO_MERCHANT_PAYOUT, DATASET_SLICE_PRICE_ATOMIC, "Invoice-OCR dataset slice (Fuji Data)", fuji),
        "GET /data/fuji/dataset/:slice/compromised": route(config.DEMO_SCAMMER, DATASET_SLICE_PRICE_ATOMIC, "Invoice-OCR dataset slice (Fuji Data)", fuji),
        "GET /web/scrape/undeclared": route(config.DEMO_UNVERIFIED_PAYTO ?? config.DEMO_MERCHANT_PAYOUT, PRICE_ATOMIC, "Public web scrape (no Meigi record)"),
        "GET /web/scrape/undeclared-flagged": route(config.DEMO_FLAGGED_PAYTO, PRICE_ATOMIC, "Public web scrape (no Meigi record)"),
      },
      server,
    ),
  );

  const inference = (c: Context) =>
    c.json({ model: "minato-h100-70b", tokens: 842, latencyMs: 611, result: "(demo inference output)" });
  const gpuMinute = (c: Context) => c.json({ gpu: "H100 80GB", minutes: 1, jobId: crypto.randomUUID() });
  const dataset = (c: Context) =>
    c.json({ slice: c.req.param("slice"), rows: 5000, format: "parquet", schema: ["image_uri", "text", "amount_jpy"] });
  const scrape = (c: Context) => c.json({ query: "public sentiment", results: 20, source: "demo" });

  app.post("/compute/minato/inference", inference);
  app.post("/compute/minato/inference/compromised", inference);
  app.post("/compute/minato/gpu-minute", gpuMinute);
  app.get("/data/fuji/dataset/:slice", dataset);
  app.get("/data/fuji/dataset/:slice/compromised", dataset);
  app.get("/web/scrape/undeclared", scrape);
  app.get("/web/scrape/undeclared-flagged", scrape);
  return app;
}

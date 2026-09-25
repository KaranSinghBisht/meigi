import { meigiPayeeDeclaration } from "@meigi/x402-guard";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { Hono, type Context } from "hono";
import { NETWORK, PRICE_ATOMIC, type Config } from "./config.js";
import { localFacilitator } from "./facilitator.js";

/**
 * A JPY FX data API behind an x402 paywall, paid in (mock) JPYC.
 * - `/honest/fx` and `/compromised/fx` declare the company's T-number through the `meigi-payee` extension.
 *   `/compromised/fx` models a hacked server that swapped `payTo`: an attacker can edit a web server, but not
 *   the company's registry entry.
 * - `/unverified/fx` and `/unverified-flagged/fx` declare nothing, like most of the web today. A buyer can
 *   only judge them by screening `payTo`.
 */
export function merchantApp(config: Config) {
  const server = new x402ResourceServer(localFacilitator(config)).register(NETWORK, new ExactEvmScheme());
  const price = { asset: config.TOKEN_ADDRESS, amount: PRICE_ATOMIC, extra: { name: "Mock JPY Coin", version: "1" } };
  const extensions = meigiPayeeDeclaration(config.DEMO_MERCHANT_T_NUMBER);
  const route = (payTo: string, declared = true) => ({
    accepts: { scheme: "exact", network: NETWORK, payTo, price },
    description: "JPY/USD reference rate (demo data)",
    mimeType: "application/json",
    ...(declared ? { extensions } : {}),
  });

  const app = new Hono();
  app.use(
    paymentMiddleware(
      {
        "GET /merchant/honest/fx": route(config.DEMO_MERCHANT_PAYOUT),
        "GET /merchant/compromised/fx": route(config.DEMO_SCAMMER),
        "GET /merchant/unverified/fx": route(config.DEMO_UNVERIFIED_PAYTO ?? config.DEMO_MERCHANT_PAYOUT, false),
        "GET /merchant/unverified-flagged/fx": route(config.DEMO_FLAGGED_PAYTO, false),
      },
      server,
    ),
  );
  const fx = (c: Context) => c.json({ pair: "JPY/USD", rate: 0.0068, asOf: new Date().toISOString(), source: "demo" });
  app.get("/merchant/honest/fx", fx);
  app.get("/merchant/compromised/fx", fx);
  app.get("/merchant/unverified/fx", fx);
  app.get("/merchant/unverified-flagged/fx", fx);
  return app;
}

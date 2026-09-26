import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { AppDeps } from "./deps.js";
import { handleError, requireHost, requireToken } from "./http.js";
import { approvalRoutes } from "./routes/approval.js";
import { demoRoutes } from "./routes/demo.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { vaultRoutes } from "./routes/vault.js";

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.onError(handleError);
  app.use("*", requireHost(deps.allowedHosts));
  app.use("*", cors({ origin: deps.origins, allowMethods: ["GET", "POST"] }));
  app.use(
    "*",
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ code: "payload_too_large", message: "the body is over 64 KB" }, 413),
    }),
  );
  if (deps.apiToken) app.use("*", requireToken(deps.apiToken));
  app.notFound((c) => c.json({ code: "not_found", message: "no such endpoint" }, 404));
  app.get("/health", (c) => c.json({ ok: true, ...deps.info }));
  app.route("/invoices", invoiceRoutes(deps));
  app.route("/invoices", approvalRoutes(deps));
  app.route("/vault", vaultRoutes(deps));
  app.route("/demo", demoRoutes(deps));
  return app;
}

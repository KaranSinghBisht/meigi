import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { AppDeps } from "./deps.js";
import { handleError } from "./http.js";
import { RateLimiter } from "./limits/rate.js";
import { intentRoutes } from "./routes/intents.js";
import { leiRoutes } from "./routes/lei.js";
import { lookupRoutes } from "./routes/lookup.js";
import { pendingRoutes } from "./routes/pending.js";
import { registrationRoutes } from "./routes/registrations.js";

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use("*", cors({ origin: deps.origins, allowMethods: ["GET", "POST"], exposeHeaders: ["Retry-After"] }));
  app.use("*", bodyLimit({ maxSize: 64 * 1024 }));
  app.onError(handleError);
  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/", lookupRoutes(deps));
  app.route("/", leiRoutes(deps));
  const limiter = new RateLimiter(); // per app: rate-limit state never leaks between instances (or tests)
  app.route("/registrations", pendingRoutes(deps, limiter)); // before /:id, so /registrations/pending matches here
  app.route("/registrations", registrationRoutes(deps, limiter));
  app.route("/intents", intentRoutes(deps));
  return app;
}

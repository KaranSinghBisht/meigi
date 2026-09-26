import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { AppDeps } from "./deps.js";
import { handleError } from "./http.js";
import { intentRoutes } from "./routes/intents.js";
import { leiRoutes } from "./routes/lei.js";
import { lookupRoutes } from "./routes/lookup.js";
import { registrationRoutes } from "./routes/registrations.js";

export function createApp(deps: AppDeps) {
  const app = new Hono();
  app.use("*", cors({ origin: deps.origins, allowMethods: ["GET", "POST"] }));
  app.use("*", bodyLimit({ maxSize: 64 * 1024 }));
  app.onError(handleError);
  app.get("/health", (c) => c.json({ ok: true }));
  app.route("/", lookupRoutes(deps));
  app.route("/", leiRoutes(deps));
  app.route("/registrations", registrationRoutes(deps));
  app.route("/intents", intentRoutes(deps));
  return app;
}

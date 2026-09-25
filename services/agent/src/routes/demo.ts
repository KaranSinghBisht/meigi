import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { z } from "zod";
import type { AppDeps } from "../deps.js";
import { HttpError } from "../http.js";

const manifest = z.object({
  invoices: z.array(z.object({ file: z.string().regex(/^[\w.-]+$/u), title: z.string(), expect: z.unknown() })),
  vendors: z.array(z.unknown()),
});

/** The fictional demo documents (scripts/demo-invoices), so the console can offer them as starting points. */
export function demoRoutes(deps: AppDeps) {
  const app = new Hono();

  app.get("/invoices", async (c) => {
    let parsed: z.infer<typeof manifest>;
    try {
      parsed = manifest.parse(JSON.parse(await readFile(join(deps.demoDir, "vendors.json"), "utf8")));
    } catch (error) {
      process.stderr.write(`[agent] demo manifest unreadable: ${error instanceof Error ? error.name : "error"}\n`);
      throw new HttpError(404, "demo_unavailable", "the demo invoices are not available");
    }
    const invoices = await Promise.all(
      parsed.invoices.map(async (invoice) => ({ ...invoice, text: await readFile(join(deps.demoDir, invoice.file), "utf8") })),
    );
    return c.json({ vendors: parsed.vendors, invoices });
  });

  return app;
}

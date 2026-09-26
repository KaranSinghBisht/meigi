import { Hono, type Context } from "hono";
import { nowSeconds, type AppDeps } from "../deps.js";
import { HttpError } from "../http.js";
import { parseLei, type LeiRecord } from "../lei/lei.js";
import { policyOf } from "../limits/policy.js";
import type { RateLimiter } from "../limits/rate.js";
import { nameKey } from "../nta/corporations.js";
import { formatTNumber } from "../tnumber.js";

/**
 * Japanese entities in GLEIF can be linked to their NTA record: the same legal name, exactly (NFKC, no spaces).
 * Anything fuzzier is not a link.
 */
function ntaLinks(deps: AppDeps, record: LeiRecord) {
  if (record.country !== "JP" && record.jurisdiction !== "JP") return [];
  const names = [record.legalName, ...record.otherNames];
  const seen = new Set<string>();
  const links: { tNumber: string; name: string }[] = [];
  for (const candidate of names) {
    for (const corporation of deps.corporations.byNameKey(nameKey(candidate))) {
      if (seen.has(corporation.number)) continue;
      seen.add(corporation.number);
      links.push({ tNumber: formatTNumber(corporation.number), name: corporation.name });
    }
  }
  return links;
}

export function leiRoutes(deps: AppDeps, limiter: RateLimiter) {
  const app = new Hono();
  const policy = policyOf(deps);
  const client = (c: Context) => (deps.clientIp ? deps.clientIp(c) : "unknown");

  /** A global company by LEI: GLEIF's record, and for Japanese entities the T-number it matches exactly. */
  app.get("/lei/:lei", async (c) => {
    limiter.hit("lei", client(c), policy.ratePerHour.lei, nowSeconds(deps));
    const lei = parseLei(c.req.param("lei"));
    if (!lei) throw new HttpError(400, "invalid_lei", "expected a 20-character LEI with valid check digits");
    let record: LeiRecord | null;
    try {
      record = await deps.lei.lookup(lei);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      throw new HttpError(502, "lei_unavailable", `the GLEIF registry could not be reached (${detail})`);
    }
    if (!record) throw new HttpError(404, "lei_not_found", `GLEIF has no record for ${lei}`);
    const active = record.entityStatus === "ACTIVE" && record.registrationStatus === "ISSUED";
    return c.json({ ...record, active, ntaMatches: ntaLinks(deps, record) });
  });

  return app;
}

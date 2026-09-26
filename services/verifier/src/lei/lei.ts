import { z } from "zod";

/**
 * Global companies: the Legal Entity Identifier (ISO 17442), looked up in GLEIF's public registry. It is the same
 * verification pattern as the NTA T-number (an official identifier, an exact legal name), for companies anywhere.
 */

/** 18 alphanumerics then 2 check digits; the whole code is valid when it is 1 mod 97 (ISO 7064 MOD 97-10, as IBAN). */
const LEI_FORMAT = /^[A-Z0-9]{18}[0-9]{2}$/u;
const GLEIF_API = "https://api.gleif.org/api/v1";

export interface LeiRecord {
  lei: string;
  legalName: string;
  language: string | null;
  otherNames: string[];
  jurisdiction: string | null;
  country: string | null;
  city: string | null;
  entityStatus: string;
  registrationStatus: string;
  nextRenewalDate: string | null;
}

export interface LeiRegistry {
  /** The GLEIF record, or null when GLEIF has no such LEI. Throws when GLEIF can't be reached. */
  lookup(lei: string): Promise<LeiRecord | null>;
}

/** Returns the normalised LEI (upper case, no spaces) when its format and check digits are valid. */
export function parseLei(input: string): string | null {
  const lei = input.replace(/\s+/gu, "").toUpperCase();
  if (!LEI_FORMAT.test(lei)) return null;
  return mod97(lei) === 1 ? lei : null;
}

function mod97(code: string): number {
  let remainder = 0;
  for (const char of code) {
    // Letters count as two digits: A = 10 … Z = 35.
    const digits = char >= "A" ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder;
}

const name = z.object({ name: z.string(), language: z.string().nullish() });
const address = z.object({ city: z.string().nullish(), country: z.string().nullish() }).nullish();
const recordSchema = z.object({
  data: z.object({
    id: z.string(),
    attributes: z.object({
      entity: z.object({
        legalName: name,
        otherNames: z.array(name).nullish(),
        transliteratedOtherNames: z.array(name).nullish(),
        jurisdiction: z.string().nullish(),
        legalAddress: address,
        status: z.string(),
      }),
      registration: z.object({ status: z.string(), nextRenewalDate: z.string().nullish() }),
    }),
  }),
});

function toRecord(body: z.infer<typeof recordSchema>): LeiRecord {
  const { entity, registration } = body.data.attributes;
  const others = [...(entity.otherNames ?? []), ...(entity.transliteratedOtherNames ?? [])].map((n) => n.name);
  return {
    lei: body.data.id,
    legalName: entity.legalName.name,
    language: entity.legalName.language ?? null,
    otherNames: others,
    jurisdiction: entity.jurisdiction ?? null,
    country: entity.legalAddress?.country ?? null,
    city: entity.legalAddress?.city ?? null,
    entityStatus: entity.status,
    registrationStatus: registration.status,
    nextRenewalDate: registration.nextRenewalDate ?? null,
  };
}

/** GLEIF's public API: no key, read-only. Each lookup has a 10 s timeout. */
export function gleifRegistry(fetchImpl: typeof fetch = globalThis.fetch, base: string = GLEIF_API): LeiRegistry {
  return {
    async lookup(lei: string): Promise<LeiRecord | null> {
      const response = await fetchImpl(`${base}/lei-records/${encodeURIComponent(lei)}`, {
        headers: { accept: "application/vnd.api+json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`GLEIF answered HTTP ${response.status}`);
      return toRecord(recordSchema.parse(await response.json()));
    },
  };
}

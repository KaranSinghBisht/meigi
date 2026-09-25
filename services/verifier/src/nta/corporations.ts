import { DatabaseSync } from "node:sqlite";

/** One row of the NTA 法人番号 index built by scripts/build_nta_index.py. */
export interface Corporation {
  number: string;
  name: string;
  kind: string;
  pref: string;
  city: string;
  street: string;
  postCode: string;
  closeDate: string;
  enName: string;
  furigana: string;
}

export interface CorporationIndex {
  byNumber(digits: string): Corporation | null;
}

export type NameCheck =
  | { ok: true; corporation: Corporation }
  | { ok: false; reason: "not_found" | "closed" | "name_mismatch"; corporation?: Corporation };

/**
 * The only normalisation allowed before an exact match: NFKC (full/half width, e.g. "Ｃｕｒｖｅｇｒｉｄ" vs
 * "Curvegrid") and whitespace removal. Anything fuzzier goes to manual review, never auto-accept.
 */
export function nameKey(name: string): string {
  return name.normalize("NFKC").replace(/\s+/gu, "");
}

export function checkRegisteredName(index: CorporationIndex, digits: string, claimedName: string): NameCheck {
  const corporation = index.byNumber(digits);
  if (!corporation) return { ok: false, reason: "not_found" };
  if (corporation.closeDate) return { ok: false, reason: "closed", corporation };
  if (nameKey(corporation.name) !== nameKey(claimedName)) {
    return { ok: false, reason: "name_mismatch", corporation };
  }
  return { ok: true, corporation };
}

interface CorporationRow {
  number: string;
  name: string;
  kind: string;
  pref: string;
  city: string;
  street: string;
  post_code: string;
  close_date: string;
  en_name: string;
  furigana: string;
}

export function openCorporationIndex(path: string): CorporationIndex {
  const db = new DatabaseSync(path, { readOnly: true });
  const byNumber = db.prepare(
    "SELECT number, name, kind, pref, city, street, post_code, close_date, en_name, furigana " +
      "FROM corporations WHERE number = ?",
  );
  return {
    byNumber(digits: string): Corporation | null {
      const row = byNumber.get(digits) as CorporationRow | undefined;
      if (!row) return null;
      return {
        number: row.number,
        name: row.name,
        kind: row.kind,
        pref: row.pref,
        city: row.city,
        street: row.street,
        postCode: row.post_code,
        closeDate: row.close_date,
        enName: row.en_name,
        furigana: row.furigana,
      };
    },
  };
}

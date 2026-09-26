/** A registration as the routes see it. Timestamps are unix seconds. */
export interface RegistrationRecord {
  id: string;
  tNumber: string; // 13 digits
  legalName: string; // exact NTA-registered name
  domain: string;
  controller: string;
  payout: string;
  challenge: string; // nonce for the domain proof
  domainMethod: string | null;
  outcome: string | null; // registered | disputed
  txHash: string | null;
  createdAt: number; // unix seconds
  /** Set once the registration is queued in the public window: when the attester may submit it (unix seconds). */
  submitAfter: number | null;
  threshold: number | null; // chosen at submission
  publicId: string | null; // the id it is listed and objected to under; never the capability id above
  review: string | null; // "objected": held for manual review instead of being submitted
}

/** A raw SQLite row. */
export type Row = Record<string, string | number | null>;

export function toRecord(row: Row): RegistrationRecord {
  const text = (key: string) => (row[key] === null || row[key] === undefined ? null : String(row[key]));
  const int = (key: string) => (row[key] === null || row[key] === undefined ? null : Number(row[key]));
  return {
    id: String(row.id),
    tNumber: String(row.t_number),
    legalName: String(row.legal_name),
    domain: String(row.domain),
    controller: String(row.controller),
    payout: String(row.payout),
    challenge: String(row.challenge),
    domainMethod: text("domain_method"),
    outcome: text("outcome"),
    txHash: text("tx_hash"),
    createdAt: Math.floor(Number(row.created_at) / 1000),
    submitAfter: int("submit_after"),
    threshold: int("threshold"),
    publicId: text("public_id"),
    review: text("review"),
  };
}

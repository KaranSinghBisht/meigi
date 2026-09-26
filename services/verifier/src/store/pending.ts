import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { toRecord, type RegistrationRecord, type Row } from "./records.js";

/** What the public window shows about a queued registration: no officer data, no wallets. */
export interface PendingListing {
  id: string; // the public id, never the registration's capability id
  tNumber: string; // 13 digits
  legalName: string;
  domain: string;
  createdAt: number; // unix seconds
  submitAfter: number; // unix seconds
  status: "pending" | "under_review";
}

const QUEUED = "submit_after IS NOT NULL AND outcome IS NULL";

function toListing(row: Row): PendingListing {
  return {
    id: String(row.public_id),
    tNumber: String(row.t_number),
    legalName: String(row.legal_name),
    domain: String(row.domain),
    createdAt: Math.floor(Number(row.created_at) / 1000),
    submitAfter: Number(row.submit_after),
    status: row.review ? "under_review" : "pending",
  };
}

/** The public pending window: registrations that passed every check and wait before the attester submits them. */
export function pendingStore(db: DatabaseSync) {
  return {
    /** Queues an open registration; returns its public id, or null if it was already queued or submitted. */
    queueRegistration(id: string, threshold: number, submitAfter: number): string | null {
      const publicId = randomBytes(12).toString("hex");
      const result = db
        .prepare(
          "UPDATE registrations SET threshold = ?, submit_after = ?, public_id = ? " +
            "WHERE id = ? AND submit_after IS NULL AND outcome IS NULL",
        )
        .run(threshold, submitAfter, publicId, id);
      return result.changes === 1 ? publicId : null;
    },
    pendingRegistrations(): PendingListing[] {
      const rows = db.prepare(`SELECT * FROM registrations WHERE ${QUEUED} ORDER BY submit_after, rowid`).all();
      return (rows as Row[]).map(toListing);
    },
    pendingByPublicId(publicId: string): PendingListing | null {
      const row = db.prepare(`SELECT * FROM registrations WHERE public_id = ? AND ${QUEUED}`).get(publicId);
      return row ? toListing(row as Row) : null;
    },
    /** Records an objection and holds the registration for manual review; the attester won't submit it. */
    addObjection(publicId: string, reason: string, contact: string | null, atMs = Date.now()): void {
      db.prepare("INSERT INTO objections (public_id, reason, contact, created_at) VALUES (?, ?, ?, ?)").run(
        publicId,
        reason,
        contact,
        atMs,
      );
      db.prepare(`UPDATE registrations SET review = 'objected' WHERE public_id = ? AND ${QUEUED}`).run(publicId);
    },
    /** Queued registrations whose window has passed and that nobody objected to. */
    dueRegistrations(now: number): RegistrationRecord[] {
      const rows = db
        .prepare(`SELECT * FROM registrations WHERE ${QUEUED} AND review IS NULL AND submit_after <= ? ORDER BY rowid`)
        .all(now);
      return (rows as Row[]).map(toRecord);
    },
  };
}

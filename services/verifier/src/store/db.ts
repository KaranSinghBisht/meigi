import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { pendingStore } from "./pending.js";
import { toRecord, type RegistrationRecord, type Row } from "./records.js";

export type { RegistrationRecord } from "./records.js";

/** Verifier state: registrations in progress, enrolled officer sessions, approval intents, used nullifiers. */

export interface OfficerSession {
  officerId: string;
  sessionId: string;
  /** Self Check's z-score at enrollment, if that's the credential used; undefined for Proof of Human etc. */
  sybilScore?: number;
}

export interface IntentRecord {
  id: string;
  tNumber: string;
  action: string;
  target: string;
  nonce: string;
  deadline: string;
  signal: string;
  payload: string | null; // extra data, e.g. the new officer set
  approvals: string[]; // officer ids that proved so far
  /** Self Check's z-score per officer id that approved with it; officers who used another credential are absent. */
  approvalScores: Record<string, number>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY, t_number TEXT NOT NULL, legal_name TEXT NOT NULL, domain TEXT NOT NULL,
  controller TEXT NOT NULL, payout TEXT NOT NULL, challenge TEXT NOT NULL,
  domain_method TEXT, outcome TEXT, tx_hash TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS officers (
  registration_id TEXT NOT NULL, t_number TEXT NOT NULL, officer_id TEXT NOT NULL, session_id TEXT NOT NULL,
  PRIMARY KEY (registration_id, officer_id));
CREATE TABLE IF NOT EXISTS nullifiers (nullifier TEXT PRIMARY KEY, purpose TEXT NOT NULL, used_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS intents (
  id TEXT PRIMARY KEY, t_number TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, nonce TEXT NOT NULL,
  deadline TEXT NOT NULL, signal TEXT NOT NULL, payload TEXT, approvals TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS objections (
  public_id TEXT NOT NULL, reason TEXT NOT NULL, contact TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS officers_by_officer ON officers (officer_id);
`;

/** Columns added after the first release, per table, so an existing verifier database keeps working. */
const ADDED_COLUMNS: Record<string, Record<string, string>> = {
  registrations: {
    submit_after: "INTEGER",
    threshold: "INTEGER",
    public_id: "TEXT",
    review: "TEXT",
    claimed_at: "INTEGER",
  },
  officers: { sybil_score: "INTEGER" },
  intents: { approval_scores: "TEXT" },
};

function migrate(db: DatabaseSync): void {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    const have = new Set(rows.map((row) => row.name));
    for (const [column, type] of Object.entries(columns)) {
      if (!have.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS registrations_by_public_id ON registrations (public_id)");
}

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  migrate(db);
  return {
    ...registrations(db),
    ...officers(db),
    ...intents(db),
    ...pendingStore(db),
    /** Records a proof's nullifier. Returns false if it was already used (replay). */
    consumeNullifier(nullifier: string, purpose: string): boolean {
      const result = db
        .prepare("INSERT OR IGNORE INTO nullifiers (nullifier, purpose, used_at) VALUES (?, ?, ?)")
        .run(nullifier.toLowerCase(), purpose, Date.now());
      return result.changes === 1;
    },
  };
}

function registrations(db: DatabaseSync) {
  return {
    createRegistration(
      input: Pick<RegistrationRecord, "tNumber" | "legalName" | "domain" | "controller" | "payout">,
      createdAtMs = Date.now(),
    ) {
      const id = randomUUID();
      const challenge = randomBytes(12).toString("hex");
      db.prepare(
        "INSERT INTO registrations (id, t_number, legal_name, domain, controller, payout, challenge, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, input.tNumber, input.legalName, input.domain, input.controller, input.payout, challenge, createdAtMs);
      return { id, challenge };
    },
    getRegistration(id: string): RegistrationRecord | null {
      const row = db.prepare("SELECT * FROM registrations WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : null;
    },
    setDomainVerified(id: string, method: string): void {
      db.prepare("UPDATE registrations SET domain_method = ? WHERE id = ?").run(method, id);
    },
    /**
     * Claims a registration for one on-chain write: returns false if it is already submitted, being submitted, or
     * held. Everything that writes it on-chain claims it first, so it can never be written twice.
     */
    claimForSubmission(id: string, now: number): boolean {
      const result = db
        .prepare(
          "UPDATE registrations SET claimed_at = ? WHERE id = ? AND outcome IS NULL AND claimed_at IS NULL AND review IS NULL",
        )
        .run(now, id);
      return result.changes === 1;
    },
    releaseClaim(id: string): void {
      db.prepare("UPDATE registrations SET claimed_at = NULL WHERE id = ? AND outcome IS NULL").run(id);
    },
    /** Frees claims left by a process that stopped mid-write, so the registration is retried. */
    releaseStaleClaims(before: number): number {
      const result = db
        .prepare("UPDATE registrations SET claimed_at = NULL WHERE outcome IS NULL AND claimed_at < ?")
        .run(before);
      return Number(result.changes);
    },
    /** Sets a final review state: "rejected", or "failed:<code>" when the chain refuses it for good. */
    closeRegistration(id: string, review: string): void {
      db.prepare("UPDATE registrations SET review = ?, claimed_at = NULL WHERE id = ? AND outcome IS NULL").run(
        review,
        id,
      );
    },
    setOutcome(id: string, outcome: string, txHash: string): void {
      db.prepare("UPDATE registrations SET outcome = ?, tx_hash = ? WHERE id = ?").run(outcome, txHash, id);
    },
  };
}

function toSession(r: { officer_id: string; session_id: string; sybil_score: number | null }): OfficerSession {
  return { officerId: r.officer_id, sessionId: r.session_id, sybilScore: r.sybil_score ?? undefined };
}

function officers(db: DatabaseSync) {
  return {
    addOfficer(registrationId: string, tNumber: string, session: OfficerSession): void {
      db.prepare(
        "INSERT OR IGNORE INTO officers (registration_id, t_number, officer_id, session_id, sybil_score) " +
          "VALUES (?, ?, ?, ?, ?)",
      ).run(registrationId, tNumber, session.officerId, session.sessionId, session.sybilScore ?? null);
    },
    officersOf(registrationId: string): OfficerSession[] {
      const rows = db
        .prepare("SELECT officer_id, session_id, sybil_score FROM officers WHERE registration_id = ?")
        .all(registrationId) as { officer_id: string; session_id: string; sybil_score: number | null }[];
      return rows.map(toSession);
    },
    /** Every registration an officer (World ID session) is enrolled in, for the per-human limits. */
    registrationsOfOfficer(officerId: string): RegistrationRecord[] {
      const rows = db
        .prepare(
          "SELECT r.* FROM officers o JOIN registrations r ON r.id = o.registration_id WHERE o.officer_id = ?",
        )
        .all(officerId) as Row[];
      return rows.map(toRecord);
    },
    /** Every session ever enrolled for a T-number; callers filter by the on-chain officer set. */
    sessionsFor(tNumber: string): OfficerSession[] {
      const rows = db
        .prepare("SELECT DISTINCT officer_id, session_id, sybil_score FROM officers WHERE t_number = ?")
        .all(tNumber) as { officer_id: string; session_id: string; sybil_score: number | null }[];
      return rows.map(toSession);
    },
  };
}

function intents(db: DatabaseSync) {
  const get = (id: string): IntentRecord | null => {
    const row = db.prepare("SELECT * FROM intents WHERE id = ?").get(id) as Record<string, string> | undefined;
    if (!row) return null;
    return {
      id: row.id!,
      tNumber: row.t_number!,
      action: row.action!,
      target: row.target!,
      nonce: row.nonce!,
      deadline: row.deadline!,
      signal: row.signal!,
      payload: row.payload ?? null,
      approvals: JSON.parse(row.approvals ?? "[]") as string[],
      approvalScores: JSON.parse(row.approval_scores ?? "{}") as Record<string, number>,
    };
  };
  return {
    createIntent(intent: Omit<IntentRecord, "id" | "approvals" | "approvalScores">): string {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO intents (id, t_number, action, target, nonce, deadline, signal, payload) VALUES (?,?,?,?,?,?,?,?)",
      ).run(id, intent.tNumber, intent.action, intent.target, intent.nonce, intent.deadline, intent.signal, intent.payload);
      return id;
    },
    getIntent: get,
    /** `sybilScore` is informational only (a risk signal, never gated on): recorded alongside the approval,
     * never consulted when deciding whether the quorum is met. */
    addApproval(id: string, officerId: string, sybilScore?: number): string[] {
      const intent = get(id);
      if (!intent) return [];
      const approvals = [...new Set([...intent.approvals, officerId])];
      const approvalScores = { ...intent.approvalScores };
      if (sybilScore !== undefined) approvalScores[officerId] = sybilScore;
      db.prepare("UPDATE intents SET approvals = ?, approval_scores = ? WHERE id = ?").run(
        JSON.stringify(approvals),
        JSON.stringify(approvalScores),
        id,
      );
      return approvals;
    },
  };
}

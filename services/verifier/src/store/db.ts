import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

/** Verifier state: registrations in progress, enrolled officer sessions, approval intents, used nullifiers. */

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
}

export interface OfficerSession {
  officerId: string;
  sessionId: string;
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
`;

export type Store = ReturnType<typeof openStore>;

export function openStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return {
    ...registrations(db),
    ...officers(db),
    ...intents(db),
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
    createRegistration(input: Pick<RegistrationRecord, "tNumber" | "legalName" | "domain" | "controller" | "payout">) {
      const id = randomUUID();
      const challenge = randomBytes(12).toString("hex");
      db.prepare(
        "INSERT INTO registrations (id, t_number, legal_name, domain, controller, payout, challenge, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, input.tNumber, input.legalName, input.domain, input.controller, input.payout, challenge, Date.now());
      return { id, challenge };
    },
    getRegistration(id: string): RegistrationRecord | null {
      const row = db.prepare("SELECT * FROM registrations WHERE id = ?").get(id) as Record<string, string> | undefined;
      if (!row) return null;
      return {
        id: row.id!,
        tNumber: row.t_number!,
        legalName: row.legal_name!,
        domain: row.domain!,
        controller: row.controller!,
        payout: row.payout!,
        challenge: row.challenge!,
        domainMethod: row.domain_method ?? null,
        outcome: row.outcome ?? null,
        txHash: row.tx_hash ?? null,
      };
    },
    setDomainVerified(id: string, method: string): void {
      db.prepare("UPDATE registrations SET domain_method = ? WHERE id = ?").run(method, id);
    },
    setOutcome(id: string, outcome: string, txHash: string): void {
      db.prepare("UPDATE registrations SET outcome = ?, tx_hash = ? WHERE id = ?").run(outcome, txHash, id);
    },
  };
}

function officers(db: DatabaseSync) {
  return {
    addOfficer(registrationId: string, tNumber: string, session: OfficerSession): void {
      db.prepare(
        "INSERT OR IGNORE INTO officers (registration_id, t_number, officer_id, session_id) VALUES (?, ?, ?, ?)",
      ).run(registrationId, tNumber, session.officerId, session.sessionId);
    },
    officersOf(registrationId: string): OfficerSession[] {
      const rows = db
        .prepare("SELECT officer_id, session_id FROM officers WHERE registration_id = ?")
        .all(registrationId) as { officer_id: string; session_id: string }[];
      return rows.map((r) => ({ officerId: r.officer_id, sessionId: r.session_id }));
    },
    /** Every session ever enrolled for a T-number; callers filter by the on-chain officer set. */
    sessionsFor(tNumber: string): OfficerSession[] {
      const rows = db
        .prepare("SELECT DISTINCT officer_id, session_id FROM officers WHERE t_number = ?")
        .all(tNumber) as { officer_id: string; session_id: string }[];
      return rows.map((r) => ({ officerId: r.officer_id, sessionId: r.session_id }));
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
    };
  };
  return {
    createIntent(intent: Omit<IntentRecord, "id" | "approvals">): string {
      const id = randomUUID();
      db.prepare(
        "INSERT INTO intents (id, t_number, action, target, nonce, deadline, signal, payload) VALUES (?,?,?,?,?,?,?,?)",
      ).run(id, intent.tNumber, intent.action, intent.target, intent.nonce, intent.deadline, intent.signal, intent.payload);
      return id;
    },
    getIntent: get,
    addApproval(id: string, officerId: string): string[] {
      const intent = get(id);
      if (!intent) return [];
      const approvals = [...new Set([...intent.approvals, officerId])];
      db.prepare("UPDATE intents SET approvals = ? WHERE id = ?").run(JSON.stringify(approvals), id);
      return approvals;
    },
  };
}

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * The agent's audit log: an append-only JSONL file where every entry names the SHA-256 of the one before it, so
 * editing, dropping or reordering any past line breaks the chain from there on (`verify`). It records what happened
 * (verdicts and their reasons, approvals, payments and their transactions), never secrets, device codes or tokens,
 * and never a document's text, only its hash. With no path it lives in memory (tests).
 */

export const GENESIS = "0".repeat(64);

export interface AuditEntry {
  readonly seq: number;
  readonly at: string;
  readonly event: string;
  readonly prev: string; // the previous entry's hash, GENESIS for the first
  readonly hash: string; // SHA-256 of this entry's canonical JSON without `hash`
  readonly [field: string]: unknown;
}

export interface ChainCheck {
  readonly ok: boolean;
  readonly entries: number;
  readonly brokenAt?: number; // the first line (1-based) that doesn't fit
  readonly reason?: string;
}

export interface AuditLog {
  /** Appends one entry. Throws when it can't be written: an unwritten entry must not pass silently. */
  record(event: string, fields: Record<string, unknown>): AuditEntry;
  /** The newest `limit` entries, newest first. */
  recent(limit: number): AuditEntry[];
  verify(): ChainCheck;
}

/** JSON with object keys sorted at every level, so the same entry always hashes the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function hashOf(entry: Omit<AuditEntry, "hash">): string {
  return sha256(canonical(entry));
}

export function createAuditLog(path: string | null, now: () => Date = () => new Date()): AuditLog {
  const memory: string[] = [];
  const lines = (): string[] => (path ? (existsSync(path) ? readFileSync(path, "utf8").split("\n").filter(Boolean) : []) : memory);
  let tail = lastOf(lines());

  return {
    record(event, fields) {
      const body = { ...fields, seq: tail.seq + 1, at: now().toISOString(), event, prev: tail.hash };
      const entry: AuditEntry = { ...body, hash: hashOf(body) };
      const line = JSON.stringify(entry);
      if (path) {
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, `${line}\n`, { encoding: "utf8", mode: 0o600 });
      } else {
        memory.push(line);
      }
      tail = { seq: entry.seq, hash: entry.hash };
      return entry;
    },
    recent(limit) {
      return lines()
        .slice(-limit)
        .reverse()
        .flatMap((line) => {
          try {
            return [JSON.parse(line) as AuditEntry];
          } catch {
            return []; // a damaged line is shown by verify(), not here
          }
        });
    },
    verify: () => verifyLines(lines()),
  };
}

/** Where the chain continues: the last line's seq and hash, even if earlier lines were damaged (verify says so). */
function lastOf(lines: string[]): { seq: number; hash: string } {
  const last = lines.at(-1);
  if (!last) return { seq: 0, hash: GENESIS };
  try {
    const entry = JSON.parse(last) as Partial<AuditEntry>;
    if (typeof entry.seq === "number" && typeof entry.hash === "string") return { seq: entry.seq, hash: entry.hash };
  } catch {
    // an unreadable last line: start after it; verify() reports the damage
  }
  return { seq: lines.length, hash: sha256(last) };
}

export function verifyLines(lines: string[]): ChainCheck {
  let prev = GENESIS;
  for (const [index, line] of lines.entries()) {
    const at = index + 1;
    let entry: AuditEntry;
    try {
      entry = JSON.parse(line) as AuditEntry;
    } catch {
      return { ok: false, entries: lines.length, brokenAt: at, reason: "the line is not JSON" };
    }
    const { hash, ...body } = entry;
    if (entry.seq !== at) return { ok: false, entries: lines.length, brokenAt: at, reason: `expected entry ${at}, found ${String(entry.seq)}` };
    if (entry.prev !== prev) return { ok: false, entries: lines.length, brokenAt: at, reason: "it doesn't name the previous entry's hash" };
    if (hashOf(body) !== hash) return { ok: false, entries: lines.length, brokenAt: at, reason: "its contents don't match its hash" };
    prev = hash;
  }
  return { ok: true, entries: lines.length };
}

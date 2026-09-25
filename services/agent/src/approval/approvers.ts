import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

/**
 * Who may approve: the pairwise World ID subjects in WORLD_AGENTS_APPROVERS, or, when that list is empty, the
 * first human to approve (enrolled and persisted, so a restart keeps them). Anyone else is "wrong_human".
 */

export type ApproverCheck = "enrolled" | "matched" | "wrong_human";

export interface ApproverRegistry {
  check(sub: string): ApproverCheck;
}

const file = z.object({ version: z.literal(1), subs: z.array(z.string().min(1)) });

/** `path` null keeps the enrolment in memory (tests). */
export function createApproverRegistry(opts: { allowed: string[]; path: string | null }): ApproverRegistry {
  if (opts.allowed.length > 0) {
    const allowed = new Set(opts.allowed);
    return { check: (sub) => (allowed.has(sub) ? "matched" : "wrong_human") };
  }
  let memory: string[] = [];
  const store = {
    load: (): string[] | null => (opts.path ? load(opts.path) : memory),
    save: (subs: string[]): boolean => (opts.path ? save(opts.path, subs) : ((memory = subs), true)),
  };
  return {
    check(sub) {
      const enrolled = store.load();
      if (enrolled === null) return "wrong_human"; // unreadable store: fail closed rather than re-enroll
      if (enrolled.length > 0) return enrolled.includes(sub) ? "matched" : "wrong_human";
      return store.save([sub]) ? "enrolled" : "wrong_human"; // can't persist the enrolment: don't approve
    },
  };
}

/** The enrolled subjects; [] when nobody has enrolled; null when the store exists but can't be read. */
function load(path: string): string[] | null {
  if (!existsSync(path)) return [];
  try {
    return file.parse(JSON.parse(readFileSync(path, "utf8"))).subs;
  } catch (error) {
    process.stderr.write(`[agent] approver store unreadable: ${error instanceof Error ? error.name : "error"}\n`);
    return null;
  }
}

function save(path: string, subs: string[]): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ version: 1, subs }, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, path); // atomic: a crash never leaves a half-written approver list
    return true;
  } catch (error) {
    process.stderr.write(`[agent] could not save the approver store: ${error instanceof Error ? error.name : "error"}\n`);
    return false;
  }
}

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

/**
 * Who may approve: the pairwise World ID subjects in WORLD_AGENTS_APPROVERS, plus the one enrolled in the approver
 * file. Enrolment happens only while WORLD_AGENTS_ENROLL is on, the allow-list is empty and nobody is enrolled yet
 * (a private run before the demo, then a restart without it), so whoever scans a projected QR code first can't
 * become the approver.
 * Anyone else is "wrong_human".
 */

export type ApproverCheck = "enrolled" | "matched" | "wrong_human";

export interface ApproverRegistry {
  check(sub: string): ApproverCheck;
}

const file = z.object({ version: z.literal(1), subs: z.array(z.string().min(1)) });

export interface ApproverOptions {
  allowed: string[]; // WORLD_AGENTS_APPROVERS, matched exactly
  path: string | null; // the approver file; null keeps the enrolment in memory (tests)
  enroll: boolean; // WORLD_AGENTS_ENROLL; ignored when `allowed` pins the approvers
}

export function createApproverRegistry(opts: ApproverOptions): ApproverRegistry {
  const allowed = new Set(opts.allowed);
  let memory: string[] = [];
  const store = {
    load: (): string[] | null => (opts.path ? load(opts.path) : memory),
    save: (subs: string[]): boolean => (opts.path ? save(opts.path, subs) : ((memory = subs), true)),
  };
  return {
    check(sub) {
      if (allowed.has(sub)) return "matched";
      const enrolled = store.load();
      if (enrolled === null) return "wrong_human"; // unreadable store: fail closed rather than re-enroll
      if (enrolled.includes(sub)) return "matched";
      if (!opts.enroll || allowed.size > 0 || enrolled.length > 0) return "wrong_human"; // enrolment off, pinned, or done
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

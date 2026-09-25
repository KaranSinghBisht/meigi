import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

/**
 * Intercepta results cached by address, in memory and on disk, plus a count of every API call made. The key
 * has a 1,000-call budget, so the counter survives restarts and a result is never fetched twice.
 */

const trait = z.object({
  name: z.string(),
  risk: z.number().nullable(),
  txsCount: z.number().nullable(),
  description: z.string().nullable(),
});
const entry = z.object({ toxicScore: z.number(), traits: z.array(trait), checkedAt: z.string() });
const file = z.object({ version: z.literal(1), calls: z.number().int().nonnegative(), entries: z.record(z.string(), entry) });

export type Trait = z.infer<typeof trait>;
export type CachedScan = z.infer<typeof entry>;

export interface ScanCache {
  get(address: string): CachedScan | undefined;
  set(address: string, scan: CachedScan): void;
  calls(): number;
  recordCall(): void;
}

/** `path` null keeps everything in memory (tests). */
export function createScanCache(path: string | null): ScanCache {
  const state = load(path);
  const persist = () => {
    if (path) save(path, state);
  };
  return {
    get: (address) => state.entries[address.toLowerCase()],
    set(address, scan) {
      state.entries[address.toLowerCase()] = scan;
      persist();
    },
    calls: () => state.calls,
    recordCall() {
      state.calls += 1;
      persist();
    },
  };
}

function load(path: string | null): z.infer<typeof file> {
  const empty = { version: 1 as const, calls: 0, entries: {} };
  if (!path || !existsSync(path)) return empty;
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
    return file.parse(JSON.parse(raw));
  } catch (error) {
    // Unreadable: keep what the budget needs. Salvage the call count, or assume the budget is spent.
    const salvaged = /"calls"\s*:\s*(\d{1,9})/u.exec(raw);
    const calls = salvaged ? Number(salvaged[1]) : Number.MAX_SAFE_INTEGER;
    process.stderr.write(`[agent] screening cache unreadable (${error instanceof Error ? error.name : "error"}); ${salvaged ? "kept its call count" : "treating the call budget as spent"}\n`);
    setAside(path);
    return { ...empty, calls };
  }
}

/** Keeps a corrupt cache for inspection; failing to move it must not stop the service. */
function setAside(path: string): void {
  try {
    renameSync(path, `${path}.corrupt-${Date.now()}`);
  } catch (error) {
    process.stderr.write(`[agent] could not move the corrupt screening cache aside: ${error instanceof Error ? error.name : "error"}\n`);
  }
}

function save(path: string, state: z.infer<typeof file>): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(tmp, path); // atomic replace: a crash mid-write never leaves half a file
  } catch (error) {
    process.stderr.write(`[agent] could not save the screening cache: ${error instanceof Error ? error.name : "error"}\n`);
  }
}

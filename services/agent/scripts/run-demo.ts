import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * `pnpm demo [--force]`: sends every demo document to a running agent and prints the verdicts. With --force,
 * each held invoice is also forced, to show the chain's decoded answer. Force only simulates and never sends. A
 * genuine invoice held for a person (07) isn't forced: it waits for a verified human's approval in the console.
 */

const AGENT_URL = process.env.AGENT_URL ?? "http://localhost:8788";
const DIR = fileURLToPath(new URL("./demo-invoices/", import.meta.url));
const force = process.argv.includes("--force");
const out = (line = "") => process.stdout.write(`${line}\n`);

interface Manifest {
  invoices: { file: string; title: string; expect?: { humanApprovable?: boolean } }[];
}

async function post(path: string, body: unknown): Promise<Record<string, any>> {
  const response = await fetch(`${AGENT_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as Record<string, any>;
  if (!response.ok) throw new Error(`${path}: ${response.status} ${json.code ?? ""} ${json.message ?? ""}`);
  return json;
}

const manifest = JSON.parse(readFileSync(`${DIR}vendors.json`, "utf8")) as Manifest;
for (const invoice of manifest.invoices) {
  const analysis = await post("/invoices/analyze", { text: readFileSync(`${DIR}${invoice.file}`, "utf8") });
  const verdict = analysis.verdict as { decision: string; reasons: { code: string; message: string }[] };
  out(`${verdict.decision.toUpperCase().padEnd(5)} ${invoice.title}`);
  for (const reason of verdict.reasons.slice(0, 4)) out(`      - ${reason.code}: ${reason.message}`);
  if (analysis.proposal?.status === "ok") out(`      agent proposal: ${analysis.proposal.wouldPay ? "pay" : "don't pay"} ${analysis.proposal.payTo ?? ""}`);
  if (invoice.expect?.humanApprovable && verdict.decision === "hold") {
    out("      waits for a verified human: POST /invoices/:id/approval (World ID), then pay with the approvalId");
  } else if (force && verdict.decision === "hold") {
    const paid = await post(`/invoices/${analysis.id}/pay`, { force: true });
    const detail = paid.status === "reverted" ? paid.error.sentence : paid.status === "paid" ? paid.txHash : paid.reasons?.[0]?.message;
    out(`      forced → ${paid.status}: ${detail}`);
  }
}

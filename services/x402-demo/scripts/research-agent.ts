/**
 * Runs the research-agent scenario from the command line, against the x402 demo's own merchant routes
 * (starts nothing itself: run `pnpm --filter @meigi/x402-demo start` first, in another terminal).
 *
 *   tsx --env-file=../../.env scripts/research-agent.ts          # human-readable step log
 *   tsx --env-file=../../.env scripts/research-agent.ts --json   # the raw ScenarioResult, for recording a run
 */
import { loadConfig } from "../src/config.js";
import { runResearchAgent, type ScenarioStep } from "../src/scenario.js";

function short(address: string | null): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "(none)";
}

function describe(step: ScenarioStep): string {
  const lines = [`- ${step.label} [${step.method} ${step.path}]`];
  if (step.declared) {
    lines.push(`    declared: ${step.declared.tNumber}${step.declared.ens ? ` / ${step.declared.ens}` : ""}`);
    lines.push(`    ens resolves to: ${short(step.resolvedEns)}; registry payout: ${short(step.registryPayout)}`);
  } else {
    lines.push("    no Meigi declaration");
  }
  lines.push(`    payTo: ${short(step.payTo)}`);
  if (step.screening) lines.push(`    screening: ${step.screening.flagged ? "flagged" : "clean"} (${step.screening.summary})`);
  lines.push(
    step.outcome === "settled"
      ? `    -> settled, tx ${step.txHash ?? "(none)"}`
      : `    -> refused: ${step.reason ?? "(no reason given)"}`,
  );
  return lines.join("\n");
}

const config = loadConfig();
const result = await runResearchAgent(config);

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  process.stdout.write(`research agent run, started ${result.startedAt}\n\n`);
  for (const step of result.steps) process.stdout.write(`${describe(step)}\n`);
  process.stdout.write(
    `\n${result.settledCount} settled, ${result.refusedCount} refused, ${result.spentAtomic} atomic spent\n`,
  );
}

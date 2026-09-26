/**
 * `pnpm --filter @meigi/agent demo:renumber [--dry-run]`: gives the live demo invoices fresh numbers once a real
 * payment has spent them. The vault pays each (T-number, invoice number) once, so after 01 (routine) or 07 (urgent,
 * approved by a human) is paid on the live chain, the same document can only ever show "already paid".
 * - For each, it reads the vault on the agent's chain (.env: SEPOLIA_RPC_URL, VAULT_ADDRESS).
 * - An unpaid number is kept.
 * - A paid one moves to the next number that no demo or evidence document uses and the vault hasn't paid, and
 *   only its 請求書番号 line changes. 01's credit note (05) follows 01's number.
 * The agent serves the documents from disk, so the console offers the new numbers without a restart.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { agentVaultAbi } from "@meigi/abi";
import { createPublicClient, http, type Address } from "viem";
import { invoiceRefOf } from "../src/kernel/intent.js";

const DEMO = fileURLToPath(new URL("./demo-invoices/", import.meta.url));
const EVIDENCE = fileURLToPath(new URL("./evidence/", import.meta.url));
const LIVE = ["01-routine-invoice.ja.txt", "07-urgent-invoice.ja.txt"];
const CREDIT_NOTE = "05-credit-note.ja.txt"; // refers to 01 by number
const NUMBER = /請求書番号: (MS-(\d{4})-(\d{4}))/u;
const T_NUMBER = /登録番号: T(\d{13})/u;

const dryRun = process.argv.includes("--dry-run");
const rpc = process.env.SEPOLIA_RPC_URL;
const vault = process.env.VAULT_ADDRESS as Address | undefined;
if (!rpc || !vault) throw new Error("SEPOLIA_RPC_URL and VAULT_ADDRESS are needed (run with --env-file=../../.env)");
const client = createPublicClient({ transport: http(rpc) });
const paidAmount = (tNumber: string, number: string) =>
  client.readContract({ address: vault, abi: agentVaultAbi, functionName: "invoicePaidAmount", args: [BigInt(tNumber), invoiceRefOf(tNumber, number)] });

/** Every invoice number any demo or evidence document prints: never handed out again. */
function usedNumbers(): Set<string> {
  const files = [...readdirSync(DEMO).map((f) => DEMO + f), ...readdirSync(EVIDENCE).map((f) => EVIDENCE + f)].filter((f) => f.endsWith(".txt"));
  return new Set(files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/MS-\d{4}-\d{4}/gu)].map((m) => m[0])));
}

async function nextUnpaid(tNumber: string, year: string, from: number, used: Set<string>): Promise<string> {
  for (let n = from + 1; n < 10_000; n++) {
    const candidate = `MS-${year}-${String(n).padStart(4, "0")}`;
    if (!used.has(candidate) && (await paidAmount(tNumber, candidate)) === 0n) return candidate;
  }
  throw new Error(`no unpaid invoice number is left after MS-${year}-${from}`);
}

async function renumber(file: string, used: Set<string>): Promise<{ from: string; to: string } | null> {
  const text = readFileSync(DEMO + file, "utf8");
  const number = NUMBER.exec(text);
  const tNumber = T_NUMBER.exec(text)?.[1];
  if (!number || !tNumber) throw new Error(`${file} has no 請求書番号 or 登録番号 line`);
  const paid = await paidAmount(tNumber, number[1]!);
  if (paid === 0n) {
    console.log(`${file}: ${number[1]} is unpaid; kept`);
    return null;
  }
  const next = await nextUnpaid(tNumber, number[2]!, Number(number[3]), used);
  used.add(next);
  console.log(`${file}: ${number[1]} is paid; ${dryRun ? "would move" : "moved"} to ${next}`);
  if (!dryRun) writeFileSync(DEMO + file, text.replace(NUMBER, `請求書番号: ${next}`));
  return { from: number[1]!, to: next };
}

const used = usedNumbers();
for (const file of LIVE) {
  const moved = await renumber(file, used);
  if (moved && file.startsWith("01") && !dryRun) {
    const note = readFileSync(DEMO + CREDIT_NOTE, "utf8");
    writeFileSync(DEMO + CREDIT_NOTE, note.replaceAll(moved.from, moved.to));
  }
}

/**
 * `pnpm --filter @meigi/agent mandate:rehearsal <command>`: the ENS mandate's live rehearsal, spending as little as
 * possible. It drives the running agent (AGENT_URL, default http://127.0.0.1:8788) with ¥1,100 invoices from Meigi
 * Shoji in their own series, MS-2026-72xx, which the demo never uses (01 and 07 are untouched). The company revokes
 * and re-issues the mandate in between; ens runs those with its key.
 *   analyze <nn>   analyse MS-2026-72<nn>, printing its id, decision and reasons (moves no money)
 *   pay <id>       pay an analysed invoice, printing the outcome and the transaction
 *   run <nn>       both
 *   audit          the latest signer and payment entries, and whether the audit chain verifies
 */

const AGENT = process.env.AGENT_URL ?? "http://127.0.0.1:8788";

/** A routine ¥1,100 invoice (¥1,000 plus 10% tax) to Meigi Shoji's registered payout. */
function invoice(nn: string): string {
  return `請 求 書（適格請求書）

株式会社ハルカ製作所 御中

請求書番号: MS-2026-72${nn}
発行日: 2026年9月30日
お支払期限: 2026年10月31日

株式会社メイギ商事
〒100-0005 東京都千代田区丸の内九丁目9番9号 メイギビル5階
登録番号: T2011001234567
担当: 経理部 佐藤 美咲（keiri@meigi-shoji.example）

下記のとおりご請求申し上げます。

ご請求金額　¥1,100（税込）

品目                                数量      単価         金額
クラウド会計システム 追加アカウント（9月分）  1件       ¥1,000       ¥1,000

小計（10%対象）                                             ¥1,000
消費税（10%）                                               ¥100
合計                                                         ¥1,100

お支払方法: JPYC（Ethereum）
受取アドレス: 0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4
ENS: t2011001234567.payee.eth

お支払期限までにお振込みくださいますよう、よろしくお願い申し上げます。
`;
}

type Json = Record<string, any>;

async function call(method: string, path: string, body?: unknown): Promise<Json> {
  const init: RequestInit = body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
  const response = await fetch(`${AGENT}${path}`, { ...init, signal: AbortSignal.timeout(300_000) });
  return (await response.json()) as Json;
}

const codes = (reasons: Json[] | undefined) => (reasons ?? []).map((r) => r.code);

async function analyze(nn: string): Promise<Json> {
  if (!/^\d{2}$/u.test(nn)) throw new Error("the invoice's last two digits, e.g. 01 for MS-2026-7201");
  const a = await call("POST", "/invoices/analyze", { text: invoice(nn) });
  console.log(`MS-2026-72${nn}: analysis ${a.id} → ${a.verdict?.decision} ${JSON.stringify(codes(a.verdict?.reasons))}`);
  return a;
}

async function pay(id: string): Promise<void> {
  const p = await call("POST", `/invoices/${id}/pay`, {});
  console.log(`pay ${id} → ${p.status}${p.txHash ? ` tx ${p.txHash}` : ""}${p.blockNumber ? ` block ${p.blockNumber}` : ""} ${JSON.stringify(codes(p.reasons))}`);
  for (const r of p.reasons ?? []) console.log(`  ${r.code}: ${r.message}`);
}

async function audit(): Promise<void> {
  const a = await call("GET", "/audit?limit=40&verify=1");
  console.log(`audit chain: ${JSON.stringify(a.chain)}`);
  for (const e of [...a.entries].reverse()) {
    if (!["signer.simulate", "signer.pay", "payment"].includes(e.event)) continue;
    const detail = { outcome: e.outcome, status: e.status, simulation: e.simulation, txHash: e.txHash, reasons: e.reasons ? codes(e.reasons) : undefined };
    console.log(`  #${e.seq} ${e.at} ${e.event} ${JSON.stringify(detail)}`);
  }
}

const [command, arg] = process.argv.slice(2);
if (command === "analyze") await analyze(arg ?? "");
else if (command === "pay") await pay(arg ?? "");
else if (command === "run") {
  const a = await analyze(arg ?? "");
  if (a.verdict?.decision === "pay") await pay(a.id);
} else if (command === "audit") await audit();
else throw new Error("usage: mandate:rehearsal analyze <nn> | pay <id> | run <nn> | audit");

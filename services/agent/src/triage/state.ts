import type { PayeeState } from "../chain/types.js";
import type { Extracted } from "../extract/types.js";

/**
 * The System-1 `state`, shaped like PayeeBench's (what the fine-tune saw): a channel, the vendor-master line
 * the agent has on file (here: the registry's name and payout for the document's T-number), and the document.
 *   email:       { channel, payee_on_file?, from, subject, body }
 *   invoice_pdf: { channel, payee_on_file?, document }
 *   x402:        { channel, payee_on_file?, request, response }
 */
export type TriageState = Record<string, string>;

/** Kev was trained on states up to ~384 tokens and accepts 8,192; keep the head of very long documents. */
export const MAX_DOCUMENT_CHARS = 8_000;

const HEADER = /^(from|to|cc|subject|date|reply-to)\s*:\s*(.*)$/iu;

export function buildTriageState(text: string, extracted: Extracted, payee: PayeeState | null): TriageState {
  const ja = /[぀-ヿ一-鿿]/u.test(text);
  const onFile = payee && payee.status === "active" ? payeeOnFile(payee, ja, extracted.kind === "x402") : null;
  const base: TriageState = onFile ? { payee_on_file: onFile } : {};
  if (extracted.kind === "x402") {
    const request = extracted.x402?.resource ? `GET ${extracted.x402.resource}` : "GET (unknown resource)";
    return { channel: "x402", ...base, request, response: clip(text) };
  }
  const email = parseEmail(text);
  if (email) return { channel: "email", ...base, from: email.from, subject: email.subject, body: clip(email.body) };
  return { channel: "invoice_pdf", ...base, document: clip(text) };
}

/** The registry record in PayeeBench's vendor-master wording, e.g. "株式会社メイギ商事（T2011001234567）: JPYC（Ethereum）0x9B4f…". */
function payeeOnFile(payee: PayeeState, ja: boolean, x402: boolean): string {
  const t = `T${payee.tNumber}`;
  if (x402) return ja ? `${payee.legalName}（${t}）: payTo ${payee.payout}、JPYC（Ethereum）` : `${payee.legalName} (${t}): payTo ${payee.payout}, JPYC on Ethereum`;
  return ja ? `${payee.legalName}（${t}）: JPYC（Ethereum）${payee.payout}` : `${payee.legalName} (${t}): JPYC on Ethereum: ${payee.payout}`;
}

/** RFC 822-style headers at the top, a blank line, then the body. */
function parseEmail(text: string): { from: string; subject: string; body: string } | null {
  const lines = text.split("\n");
  const headers: Record<string, string> = {};
  let i = 0;
  for (; i < lines.length && lines[i]!.trim() !== ""; i++) {
    const match = HEADER.exec(lines[i]!);
    if (!match) return null;
    headers[match[1]!.toLowerCase()] = match[2]!.trim();
  }
  if (!headers.from) return null;
  return { from: headers.from, subject: headers.subject ?? "", body: lines.slice(i + 1).join("\n").trim() };
}

function clip(text: string): string {
  return text.length > MAX_DOCUMENT_CHARS ? text.slice(0, MAX_DOCUMENT_CHARS) : text;
}

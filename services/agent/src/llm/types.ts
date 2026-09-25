import { z } from "zod";

/** What the (deliberately gullible) agent LLM wants to pay. Shown in the console; it can never move money itself. */
export const ProposalSchema = z.object({
  tNumber: z.string().nullable().describe('The supplier\'s invoice registration number (登録番号): "T" + 13 digits'),
  payTo: z.string().nullable().describe("The wallet address the document says to pay (0x...)"),
  amount: z.string().nullable().describe('The amount to pay in yen, digits only, e.g. "132000"'),
  invoiceNumber: z.string().nullable().describe("The invoice number"),
  wouldPay: z.boolean().describe("true if you would pay this"),
  reasoning: z.string().describe("One or two sentences on why"),
});

export type Proposal = z.infer<typeof ProposalSchema>;

/** Everything the explanation may use: produced by the kernel and the chain, never copied from the document. */
export interface ExplanationFacts {
  decision: "pay" | "hold" | "reverted" | "paid";
  payee: { tNumber: string | null; legalName: string | null; registeredPayout: string | null };
  payment: { payTo: string | null; amount: string | null }; // no invoice number: that is document text
  reasons: { code: string; message: string }[];
  revert: { name: string; sentence: string } | null;
}

export interface LlmPort {
  provider: "anthropic" | "workers-ai" | "proxy";
  model: string;
  propose(document: string): Promise<Proposal>;
  explain(facts: ExplanationFacts): Promise<string>;
}

/** A model call that failed in a way the caller should report, not crash on. Messages are safe to show. */
export class LlmError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

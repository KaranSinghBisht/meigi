/**
 * The System-1 questions asked about every document. These are the production strings from
 * bench/payeebench/schema.py: the fine-tuned Kev binds them, so they must match byte for byte
 * (test/questions.test.ts checks them against the PayeeBench dataset). Answers only route a document
 * (auto-clear or hold); none of them can move money.
 */

export const REQUEST_TYPES = ["routine_invoice", "payee_change", "urgent_exec_request", "credit_note", "other"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const SUSPICION_LEVELS = [
  "Clearly benign: routine business, nothing unusual",
  "Some unusual elements, but probably legitimate",
  "Suspicious: red flags that need verification before paying",
  "Very likely a payment-redirection scam",
] as const;

export const TRIAGE_QUESTIONS = {
  request_type: {
    type: "choice",
    instructions: "What kind of payment request is this?",
    criteria: {
      routine_invoice: "A normal invoice, bill, payment reminder or x402 payment-required response for goods or services",
      payee_change: "A message that announces or asks for a change of bank account, wallet address or payee",
      urgent_exec_request: "An executive, manager or other authority figure asks for a special, urgent or confidential payment",
      credit_note: "A credit note, refund, return or discount that reduces the amount owed",
      other: "Anything else, such as notices, receipts, newsletters or meeting requests",
    },
  },
  new_destination: {
    type: "noul",
    instructions:
      "Does it ask to pay a bank account or wallet address that is new or different from the one on file or used before?",
  },
  pressure: {
    type: "noul",
    instructions: "Does it use urgency, secrecy or authority to push for a fast payment or to skip the usual checks?",
  },
  suspicion: {
    type: "score",
    instructions: "How likely is this to be a payment-redirection scam?",
    criteria: [...SUSPICION_LEVELS],
  },
} as const;

export type TriageQuestions = typeof TRIAGE_QUESTIONS;

/** Request types that are safe to auto-clear, and the highest suspicion level that still is (PayeeBench's rule). */
export const SAFE_TYPES: readonly RequestType[] = ["routine_invoice", "credit_note"];
export const MAX_SAFE_SUSPICION = 1;

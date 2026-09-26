import type { Address } from "viem";

/** `block` findings stop an automatic payment; `warn` findings are shown but don't. */
export type Severity = "block" | "warn";

export type FlagCode =
  | "no_t_number"
  | "multiple_t_numbers"
  | "invalid_check_digit"
  | "multiple_addresses"
  | "lookalike_addresses"
  | "bad_checksum"
  | "no_amount"
  | "amount_mismatch"
  | "multiple_totals"
  | "amount_ambiguous"
  | "credit_note"
  | "no_invoice_number"
  | "multiple_invoice_numbers"
  | "hidden_text"
  | "hidden_payment_details"
  | "html_markup"
  | "bidi_control"
  | "lookalike_digits"
  | "no_bill_wording"
  | "zero_address"
  | "prompt_injection_suspected"
  | "urgent_language";

export interface Flag {
  code: FlagCode;
  severity: Severity;
  message: string; // written by us; never quotes the document
  evidence?: string; // the document text that triggered the flag, for the console only (never sent to a model)
}

/** A yen amount as a signed decimal string ("132000", "-22000") and a display form ("¥132,000"). */
export interface Money {
  value: string;
  display: string;
}

export interface Totals {
  total: Money | null;
  subtotal: Money | null;
  tax: Money | null;
  lineItems: Money[];
  lineItemsSum: Money | null;
}

/** The first `accepts` entry of an x402 402-response. */
export interface X402Details {
  resource: string | null;
  payTo: Address | null;
  amountAtomic: string | null;
  asset: Address | null;
  network: string | null;
  scheme: string | null;
}

export type DocumentKind = "invoice" | "credit_note" | "x402" | "message";

/** Everything the deterministic layer read from a document. No model is involved in any of it. */
export interface Extracted {
  kind: DocumentKind;
  tNumbers: string[]; // "T" + 13 digits, distinct, in document order
  tNumber: string | null;
  checkDigitValid: boolean | null;
  addresses: Address[]; // checksummed, distinct, in document order
  address: Address | null;
  amount: Money | null; // what the document asks us to pay
  totals: Totals;
  invoiceNumbers: string[];
  invoiceNumber: string | null;
  dueDate: string | null; // yyyy-mm-dd
  claimedName: string | null; // the company name printed next to the T-number
  x402: X402Details | null;
  flags: Flag[];
}

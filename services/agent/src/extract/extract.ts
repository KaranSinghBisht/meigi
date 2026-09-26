import { formatUnits, zeroAddress, type Address } from "viem";
import { scanAddresses } from "./addresses.js";
import { findAmounts, MAX_HITS, type AmountHit } from "./amounts.js";
import { findDueDate } from "./dates.js";
import { asksForPayment, findClaimedName, findInvoiceNumbers, looksLikeCreditNote } from "./fields.js";
import { unsafeMarkup } from "./markup.js";
import { distinctMoney, money, sumMoney, toScaled } from "./money.js";
import { lineOf, normalizeText } from "./normalize.js";
import { injectionPhrase, urgencyPhrase } from "./signals.js";
import { findTNumbers, formatTNumber, hasCorporateCheckDigit } from "./tnumber.js";
import { computeTotals } from "./totals.js";
import type { DocumentKind, Extracted, Flag, Money, Totals, X402Details } from "./types.js";
import { parseX402 } from "./x402.js";

/** x402 amounts are atomic units of the asset; JPYC (and the Sepolia mock) use 18 decimals. Display only:
 *  the payment itself uses the atomic amount, and only when the asset is the vault's token. */
const X402_DISPLAY_DECIMALS = 18;
// Hidden content may not carry an address, a T-number (13 digits, with or without its T) or any figure that
// could be an amount without a currency sign: comma-grouped or 5+ digits (4-digit years in comments are fine).
const HIDDEN_ID = /0x[0-9a-fA-F]{40}|(?<![\d.,])(?:\d{1,3}(?:,\d{3})+|\d{5,})(?![\d,])/u;

/**
 * The deterministic reader. Regexes and arithmetic only, so nothing in the document can talk it into a
 * different answer; anything ambiguous becomes a flag instead of a guess.
 */
export function extractInvoice(raw: string): Extracted {
  const normalized = normalizeText(raw);
  // Every field is read from what a person sees; hidden parts can only add reasons to hold.
  const text = normalized.visible;
  const x402 = parseX402(text);
  const flags: Flag[] = [];
  const t = tNumberFields(text, flags);
  // An x402 `asset` is the token contract, not somewhere money is sent.
  const addresses = addressFields(text, flags, x402?.asset ?? null);
  const { amount, totals } = amountFields(text, x402, flags);
  const invoiceNumbers = x402 ? (x402.resource ? [`x402:${x402.resource}`] : []) : findInvoiceNumbers(text);
  const kind = documentKind(normalized.text, x402, amount, invoiceNumbers.length > 0 || totals.total !== null);
  flags.push(...invoiceNumberFlags(invoiceNumbers));
  if (kind === "credit_note") {
    flags.push(block("credit_note", "This is a credit note or refund: it reduces what we owe, so there is nothing to pay."));
  } else if (kind !== "x402" && !asksForPayment(text)) {
    flags.push(block("no_bill_wording", "The document never asks for payment (no 請求, invoice or amount due), so nothing is paid."));
  }
  flags.push(...textFlags(normalized.text, normalized.hiddenMarkers, normalized.hidden));
  if (normalized.bidiControls > 0) {
    flags.push(block("bidi_control", "The document contains bidirectional control characters: what a reader sees may differ from what is read here."));
  }
  if (normalized.lookalikeDigits.length > 0) {
    const message = "The document uses superscript, circled or similar digits, which can change an amount without looking like it: treated as tampering.";
    flags.push({ ...block("lookalike_digits", message), evidence: normalized.lookalikeDigits.join(" ") });
  }
  return {
    kind,
    tNumbers: t.tNumbers,
    tNumber: t.tNumber,
    checkDigitValid: t.checkDigitValid,
    ...addresses,
    amount,
    totals,
    invoiceNumbers,
    invoiceNumber: invoiceNumbers[0] ?? null,
    dueDate: findDueDate(text),
    claimedName: findClaimedName(text, t.tNumberLine),
    x402,
    flags,
  };
}

function tNumberFields(text: string, flags: Flag[]) {
  const hits = findTNumbers(text);
  const tNumbers = hits.map((hit) => formatTNumber(hit.digits));
  const primary = hits[0];
  if (!primary) flags.push(block("no_t_number", "No invoice registration number (T + 13 digits) was found."));
  if (hits.length > 1) {
    flags.push(block("multiple_t_numbers", `Several T-numbers appear (${tNumbers.join(", ")}); which company is being paid is ambiguous.`));
  }
  const checkDigitValid = primary ? hasCorporateCheckDigit(primary.digits) : null;
  if (primary && !checkDigitValid) {
    flags.push(warn("invalid_check_digit", `${formatTNumber(primary.digits)} fails the 法人番号 check digit (a typo, or a sole proprietor's number).`));
  }
  const tNumberLine = primary ? lineOf(text, primary.index) : null;
  return { tNumbers, tNumber: tNumbers[0] ?? null, checkDigitValid, tNumberLine };
}

function addressFields(text: string, flags: Flag[], asset: Address | null) {
  const scan = scanAddresses(text);
  const addresses = scan.addresses.filter((address) => address !== asset);
  if (addresses.length > 1) {
    flags.push(block("multiple_addresses", `Several payment addresses appear: ${addresses.join(", ")}.`));
  }
  if (addresses.includes(zeroAddress)) {
    flags.push(block("zero_address", "The document gives the zero address as a payment address."));
  }
  for (const [a, b] of scan.lookalikes) {
    flags.push(block("lookalike_addresses", `${a} and ${b} look alike at a glance (address poisoning).`));
  }
  for (const spelled of scan.badChecksum) {
    flags.push(warn("bad_checksum", `${spelled} has an invalid EIP-55 checksum: it was mistyped or edited by hand.`));
  }
  return { addresses, address: addresses[0] ?? null };
}

function amountFields(text: string, x402: X402Details | null, flags: Flag[]): { amount: Money | null; totals: Totals } {
  if (x402) {
    const amount = x402.amountAtomic ? money(formatUnits(BigInt(x402.amountAtomic), X402_DISPLAY_DECIMALS)) : null;
    if (!amount) flags.push(block("no_amount", "The 402 response names no amount."));
    return { amount, totals: { total: amount, subtotal: null, tax: null, lineItems: [], lineItemsSum: null } };
  }
  const { hits, truncated } = findAmounts(text);
  if (truncated) flags.push(block("amount_ambiguous", `The document prints more than ${MAX_HITS} amounts.`));
  const decimals = hits.filter((hit) => hit.decimal);
  if (decimals.length > 0) {
    const message = "An amount is printed with a decimal part, but yen has none: it may be a typo or a European thousands separator.";
    flags.push({ ...block("amount_ambiguous", message), evidence: decimals.map((hit) => hit.raw).join(", ") });
  }
  const { totals, flags: totalFlags } = computeTotals(text, hits);
  flags.push(...totalFlags);
  return { amount: payableAmount(totals, hits, flags), totals };
}

/** The labelled total wins; otherwise subtotal + tax; otherwise the only amount mentioned. */
function payableAmount(totals: Totals, hits: AmountHit[], flags: Flag[]): Money | null {
  if (totals.total) return totals.total;
  if (totals.subtotal && totals.tax) return sumMoney([totals.subtotal, totals.tax]);
  const distinct = distinctMoney(hits.map((hit) => money(hit.value)));
  if (distinct.length === 0) {
    flags.push(block("no_amount", "No amount with a currency (¥, 円, JPY or JPYC) was found."));
    return null;
  }
  if (distinct.length === 1) return distinct[0]!;
  const largest = distinct.reduce((a, b) => (toScaled(b.value) > toScaled(a.value) ? b : a));
  const listed = distinct.slice(0, 5).map((m) => m.display).join(", ");
  flags.push(block("amount_ambiguous", `Several amounts and no labelled total (${listed}); assuming the largest, ${largest.display}.`));
  return largest;
}

function documentKind(text: string, x402: X402Details | null, amount: Money | null, invoiceLike: boolean): DocumentKind {
  if (x402) return "x402";
  if (looksLikeCreditNote(text) || (amount && toScaled(amount.value) < 0n)) return "credit_note";
  return invoiceLike ? "invoice" : "message";
}

/** No printed number means no stable duplicate-payment key, so nothing is paid automatically. */
function invoiceNumberFlags(numbers: string[]): Flag[] {
  if (numbers.length === 0) {
    return [block("no_invoice_number", "No invoice number was found, so a repeat of this document could not be told apart.")];
  }
  if (numbers.length === 1) return [];
  return [{ ...warn("multiple_invoice_numbers", "Several invoice numbers appear; the first one is used."), evidence: numbers.join(", ") }];
}

/** Injection and urgency are scanned in the full text: hidden instructions are exactly what they look for. */
function textFlags(text: string, hiddenMarkers: string[], hidden: string): Flag[] {
  const flags: Flag[] = [];
  if (hiddenMarkers.length > 0) {
    flags.push(warn("hidden_text", `The document contains content a person wouldn't see: ${hiddenMarkers.join(", ")}.`));
  }
  const markup = unsafeMarkup(text);
  if (markup) {
    const message = "The document contains markup (HTML tags or comments) that can hide text from a reader; a person must review it.";
    flags.push({ ...block("html_markup", message), evidence: markup });
  }
  const detail = hiddenPaymentDetail(hidden);
  if (detail) {
    const message = "Payment details (an amount, a registration number or an address) are hidden from the reader: treated as tampering.";
    flags.push({ ...block("hidden_payment_details", message), evidence: detail });
  }
  const injection = injectionPhrase(text);
  if (injection) {
    flags.push({ ...block("prompt_injection_suspected", "The document contains instructions aimed at an AI reader."), evidence: injection });
  }
  const urgency = urgencyPhrase(text);
  if (urgency) flags.push({ ...warn("urgent_language", "The document pushes urgency or secrecy."), evidence: urgency });
  return flags;
}

/** The first amount (万円/千円 forms included), 13-digit number or address in hidden content, or null. */
function hiddenPaymentDetail(hidden: string): string | null {
  if (!hidden) return null;
  const amount = findAmounts(hidden).hits[0];
  if (amount) return amount.raw;
  return HIDDEN_ID.exec(hidden)?.[0] ?? null;
}

function block(code: Flag["code"], message: string): Flag {
  return { code, severity: "block", message };
}

function warn(code: Flag["code"], message: string): Flag {
  return { code, severity: "warn", message };
}

/**
 * Text normalisation before any extraction. NFKC folds full-width forms (Ｔ２０１１…, ￥１３２，０００, ０ｘ…)
 * into ASCII, so every regex downstream sees one spelling. Extraction then reads only what a person would
 * see: invisible characters, HTML comments and hidden elements are removed and reported, because hiding
 * payment details from the human reviewer is itself tampering.
 */

// Zero-width spaces/joiners, word joiner, invisible operators, BOM, soft hyphen, variation selectors and
// Unicode tag characters (which can spell out whole hidden instructions).
const INVISIBLE = /[­​-‍⁠-⁤﻿︀-️\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
// Bidirectional overrides ("Trojan Source"): they reorder what a human sees without changing the bytes.
const BIDI = /[‎‏‪-‮⁦-⁩]/gu;
const NON_ASCII = /[^\x00-\x7F]/gu;
// What a look-alike digit must not touch: a digit (ASCII or full-width), a comma or period inside a number, ¥/￥ or 円.
const NUMBERISH = /^[0-9０-９,.，．¥￥円]$/u;
// An opening tag that hides its content: display:none, visibility:hidden, font-size:0, opacity:0, white text,
// or the `hidden` attribute. Bounded so hostile input stays linear.
const HIDDEN_TAG =
  /<([a-zA-Z][a-zA-Z0-9]{0,15})\b(?=[^>]{0,800}?(?:(?<=\s)hidden(?=[\s>/=])|style\s*=\s*["'][^"']{0,500}?(?:display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?![.\d])|opacity\s*:\s*0(?![.\d])|(?<![-\w])color\s*:\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)))))[^>]{0,800}>/giu;

export interface Normalized {
  text: string; // everything, hidden parts included: what a model reads (and what injection checks scan)
  visible: string; // what a person sees: the only text extraction reads
  hidden: string; // what was removed from `visible`
  hiddenMarkers: string[]; // human-readable descriptions of hidden content, if any
  bidiControls: number; // reorder what a person sees, so the displayed text may not be what extraction reads
  lookalikeDigits: string[]; // superscript, circled and similar digits touching a number (all are replaced by a space)
}

export function normalizeText(raw: string): Normalized {
  const hiddenMarkers: string[] = [];
  const invisible = raw.match(INVISIBLE)?.length ?? 0;
  const bidi = raw.match(BIDI)?.length ?? 0;
  if (invisible > 0) hiddenMarkers.push(`${invisible} invisible character${invisible === 1 ? "" : "s"}`);
  if (bidi > 0) hiddenMarkers.push(`${bidi} bidirectional control character${bidi === 1 ? "" : "s"}`);
  const touching = new Set<string>();
  // Before NFKC, which would turn ¹ ① ₁ into ASCII digits that silently join an amount (¥13,200¹ → ¥132,001). Every
  // one becomes a space; only one touching a number is reported, so a list marker ("① 設計費") passes.
  const stripped = raw.replace(INVISIBLE, "").replace(BIDI, "");
  const safe = stripped.replace(NON_ASCII, (ch: string, offset: number) => {
    if (!lookalikeDigit(ch)) return ch;
    if (touchesNumber(stripped, offset, ch.length)) touching.add(ch);
    return " ";
  });
  const text = safe.normalize("NFKC").replace(/\r\n?/gu, "\n");
  const comments = cut(text, commentSpans(text));
  const elements = cut(comments.kept, hiddenElementSpans(comments.kept));
  if (comments.removed.length > 0) hiddenMarkers.push("an HTML comment");
  if (elements.removed.length > 0) hiddenMarkers.push("an element styled to be invisible");
  const hidden = [...comments.removed, ...elements.removed].join("\n");
  return { text, visible: elements.kept, hidden, hiddenMarkers, bidiControls: bidi, lookalikeDigits: [...touching] };
}

/** The characters right before and after text[offset, offset + length), whole code points, with no gap allowed. */
function touchesNumber(text: string, offset: number, length: number): boolean {
  const before = Array.from(text.slice(Math.max(0, offset - 2), offset)).pop() ?? "";
  const after = Array.from(text.slice(offset + length, offset + length + 2))[0] ?? "";
  return NUMBERISH.test(before) || NUMBERISH.test(after);
}

/**
 * A character NFKC turns into an ASCII digit: superscripts, subscripts, circled, parenthesised and full-stop digits,
 * fractions, mathematical digits. Full-width ０-９ (U+FF10-FF19) are ordinary Japanese typing and stay.
 */
function lookalikeDigit(ch: string): boolean {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0xff10 && cp <= 0xff19) return false;
  return /[0-9]/u.test(ch.normalize("NFKC"));
}

type Span = [start: number, end: number];

/** Every `<!-- ... -->` (an unclosed comment runs to the end), found with indexOf so it stays linear. */
function commentSpans(text: string): Span[] {
  const spans: Span[] = [];
  let from = 0;
  for (;;) {
    const open = text.indexOf("<!--", from);
    if (open === -1) return spans;
    const close = text.indexOf("-->", open + 4);
    const end = close === -1 ? text.length : close + 3;
    spans.push([open, end]);
    from = end;
  }
}

/** Every hidden element, from its opening tag to the matching close tag (same-name nesting is counted). */
function hiddenElementSpans(text: string): Span[] {
  const spans: Span[] = [];
  let from = 0;
  for (const match of text.matchAll(HIDDEN_TAG)) {
    const start = match.index ?? 0;
    if (start < from) continue; // inside an element already removed
    const end = closingTagEnd(text, match[1]!.toLowerCase(), start + match[0].length);
    spans.push([start, end]);
    from = end;
  }
  return spans;
}

function closingTagEnd(text: string, tag: string, from: number): number {
  const lower = text.toLowerCase();
  let depth = 1;
  let at = from;
  while (depth > 0) {
    const open = lower.indexOf(`<${tag}`, at);
    const close = lower.indexOf(`</${tag}`, at);
    if (close === -1) return text.length; // unclosed: hidden to the end
    if (open !== -1 && open < close) {
      depth++;
      at = open + tag.length + 1;
    } else {
      depth--;
      at = close + tag.length + 2;
    }
  }
  const gt = text.indexOf(">", at);
  return gt === -1 ? text.length : gt + 1;
}

/** Removes the spans (keeping line breaks, so line-based reading of the rest is unchanged). */
function cut(text: string, spans: Span[]): { kept: string; removed: string[] } {
  if (spans.length === 0) return { kept: text, removed: [] };
  const removed: string[] = [];
  let kept = "";
  let at = 0;
  for (const [start, end] of spans) {
    kept += text.slice(at, start) + "\n".repeat(countLines(text, start, end));
    removed.push(text.slice(start, end));
    at = end;
  }
  return { kept: kept + text.slice(at), removed };
}

function countLines(text: string, start: number, end: number): number {
  let lines = 0;
  for (let i = start; i < end; i++) if (text.charCodeAt(i) === 10) lines++;
  return lines;
}

/** 0-based line number of a character index. */
export function lineOf(text: string, index: number): number {
  let line = 0;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

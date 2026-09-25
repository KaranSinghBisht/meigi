/**
 * HTML can hide text in more ways than any stripper can enumerate (CSS classes, <style>, <template>, tiny fonts,
 * entity-encoded or "<"-containing attributes, bogus comments, CDATA...). So the rule is fail-closed: everything a
 * browser could start parsing as markup ("<" followed by a letter, "/", "!" or "?") must be a bare formatting tag
 * or an address in angle brackets. Anything else means a person must read it: payment is blocked, and force too.
 */

const SAFE_TAGS = [
  "p", "br", "div", "span", "b", "strong", "i", "em", "u",
  "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "pre", "code", "blockquote", "hr",
];

const MARKUP_START = /<[A-Za-z/!?]/gu;
// Sticky patterns, tried exactly where a markup start was found.
const BARE_TAG = new RegExp(String.raw`</?(?:${SAFE_TAGS.join("|")})\s{0,5}/?>`, "iuy");
const ANGLE_EMAIL = /<[^\s<>@"']{1,64}@[^\s<>"']{1,255}>/uy; // "Name <keiri@example.jp>"
const ANGLE_URL = /<https?:\/\/[^\s<>"']{1,2000}>/iuy;

/** The first markup that isn't a bare formatting tag or an address in angle brackets, or null. */
export function unsafeMarkup(text: string): string | null {
  for (const match of text.matchAll(MARKUP_START)) {
    const index = match.index ?? 0;
    if ([BARE_TAG, ANGLE_EMAIL, ANGLE_URL].some((pattern) => matchesAt(pattern, text, index))) continue;
    return text.slice(index, index + 80).split("\n")[0]!;
  }
  return null;
}

function matchesAt(pattern: RegExp, text: string, index: number): boolean {
  pattern.lastIndex = index;
  return pattern.test(text);
}

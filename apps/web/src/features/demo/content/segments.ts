// Splits a recorded document into plain text and marked spans (the values the agent read), so the player can
// light exactly the characters the extraction found. Marks are looked up in the text, never typed in by hand.

export interface Segment {
  readonly text: string
  /** The mark's key, e.g. "tNumber"; null for plain text. */
  readonly mark: string | null
}

export interface MarkSpec {
  readonly key: string
  /** The exact text to find; a missing value is skipped rather than guessed. */
  readonly find: string | null
  /** Text that, when it directly follows the value, belongs to the span too (e.g. "（税込）" after an amount). */
  readonly suffix?: string
}

interface Range {
  readonly start: number
  readonly end: number
  readonly key: string
}

function locate(text: string, spec: MarkSpec): Range | null {
  if (!spec.find) return null
  const start = text.indexOf(spec.find)
  if (start < 0) return null
  let end = start + spec.find.length
  if (spec.suffix && text.startsWith(spec.suffix, end)) end += spec.suffix.length
  return { start, end, key: spec.key }
}

/** The text cut into segments; overlapping marks keep the earlier one. */
export function segment(text: string, specs: readonly MarkSpec[]): Segment[] {
  const ranges = specs
    .map((spec) => locate(text, spec))
    .filter((range): range is Range => range !== null)
    .sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  let cursor = 0
  for (const range of ranges) {
    if (range.start < cursor) continue
    if (range.start > cursor) out.push({ text: text.slice(cursor, range.start), mark: null })
    out.push({ text: text.slice(range.start, range.end), mark: range.key })
    cursor = range.end
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), mark: null })
  return out
}

export interface MailHeaders {
  readonly fromName: string
  readonly fromAddress: string
  readonly to: string
  readonly subject: string
  readonly date: string
}

const header = (lines: readonly string[], name: string): string =>
  lines
    .find((line) => line.startsWith(`${name}:`))
    ?.slice(name.length + 1)
    .trim() ?? ''

/** Reads the RFC 822-style head of a recorded email: "From: Name <addr>", To, Subject, Date, then a blank line. */
export function splitMail(document: string): { readonly headers: MailHeaders; readonly body: string } {
  const gap = document.indexOf('\n\n')
  if (gap < 0) throw new Error('the recorded email has no header block')
  const lines = document.slice(0, gap).split('\n')
  const from = header(lines, 'From')
  const match = /^(.*)<([^>]+)>$/.exec(from)
  return {
    headers: {
      fromName: (match?.[1] ?? from).trim(),
      fromAddress: (match?.[2] ?? '').trim(),
      to: header(lines, 'To'),
      subject: header(lines, 'Subject'),
      date: header(lines, 'Date'),
    },
    body: document.slice(gap + 2),
  }
}

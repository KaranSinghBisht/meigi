// "Ask the ledger": what the model says is checked before anyone sees it. Any tx hash, address or amount in the
// answer must be in the rows or the precomputed facts; otherwise the fixed refusal is served instead. Cited
// transactions that aren't rows are dropped.

import { plainNumber, type Allowed } from './ask-facts'

export const REFUSAL = 'I can only answer about these settlements.'
const MAX_ANSWER = 600
const MAX_CITED = 5

/** Plain text only: no control characters or markdown marks, single spaces, at most MAX_ANSWER characters. */
export function sanitize(text: string): string {
  const plain = text
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/[`*_#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (plain.length <= MAX_ANSWER) return plain
  const cut = plain.slice(0, MAX_ANSWER)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), MAX_ANSWER / 2))}…`
}

const HEX = /0x[0-9a-f]+(?:(?:…|\.\.\.)[0-9a-f]+)?/gi
const CURRENCY = /(?:¥|JPY)\s?(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s?(?:m?JPYC\b|yen\b|円)/gi
const BIG_NUMBER = /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d{4,}(?:\.\d+)?\b/g

/** A hash or address, whole or shortened (0x1234…abcd, or a prefix of at least 8 hex digits), that is in the rows. */
function knownHex(token: string, allowed: Allowed): boolean {
  const lower = token.toLowerCase()
  const known = [...allowed.hashes, ...allowed.addresses]
  const [head = '', tail] = lower.split(/…|\.\.\./)
  if (tail !== undefined)
    return head.length >= 6 && known.some((value) => value.startsWith(head) && value.endsWith(tail))
  if (lower.length === 66) return allowed.hashes.has(lower)
  if (lower.length === 42) return allowed.addresses.has(lower)
  return lower.length >= 10 && known.some((value) => value.startsWith(lower))
}

/** Why an answer can't be shown: every hash, address and amount it names that the rows and facts don't have. */
export function violations(answer: string, allowed: Allowed): string[] {
  const found: string[] = []
  for (const [token] of answer.matchAll(HEX)) if (!knownHex(token, allowed)) found.push(`hex:${token}`)
  for (const match of answer.matchAll(CURRENCY)) {
    const value = plainNumber(match[1] ?? match[2] ?? '')
    if (!allowed.amounts.has(value)) found.push(`amount:${value}`)
  }
  // Every other large number (currency amounts are already checked above): a block, a count, a T-number, a total.
  for (const [token] of answer.replace(HEX, ' ').replace(CURRENCY, ' ').matchAll(BIG_NUMBER)) {
    const value = plainNumber(token)
    const year = /^\d{4}$/.test(value) && Number(value) >= 1900 && Number(value) <= 2100
    if (!year && !allowed.numbers.has(value)) found.push(`number:${value}`)
  }
  return found
}

/** The cited transactions that are rows (lower-cased, as tx hashes are), unique, at most MAX_CITED. */
export function citedRows(cited: unknown, hashes: ReadonlySet<string>): string[] {
  if (!Array.isArray(cited)) return []
  const kept = cited.filter((tx): tx is string => typeof tx === 'string' && hashes.has(tx.toLowerCase()))
  return [...new Set(kept.map((tx) => tx.toLowerCase()))].slice(0, MAX_CITED)
}

export interface Answer {
  readonly answer: string
  readonly citedTx: readonly string[]
}

/** The model's reply, checked: the fixed refusal whenever it names anything the rows and facts don't have. */
export function guardAnswer(reply: { answer?: unknown; citedTx?: unknown } | null, allowed: Allowed): Answer {
  const answer = typeof reply?.answer === 'string' ? sanitize(reply.answer) : ''
  if (!answer || answer === REFUSAL || violations(answer, allowed).length > 0) return { answer: REFUSAL, citedTx: [] }
  return { answer, citedTx: citedRows(reply?.citedTx, allowed.hashes) }
}

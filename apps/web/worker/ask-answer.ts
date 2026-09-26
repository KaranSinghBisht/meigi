// "Ask the ledger": the answer to a checked query, computed from the rows and written from fixed templates. Every
// amount, name and date in it comes from the rows. The model's words never reach the visitor.

import type { Payee, Query } from './ask-intent'
import { largestOf, matching, mostPaid, totalOf, yenOf } from './ask-scope'
import type { Kind, Settlement } from './settlements'

export const REFUSAL = 'I can only answer questions about these settlements.'
/** The same three as the panel's suggestion chips. */
export const SUGGESTED = [
  'Who has been paid the most?',
  'How much have agents spent over x402?',
  'What was the most recent payment?',
] as const
const MAX_CITED = 5

export interface Answer {
  readonly answer: string
  /** The rows the answer comes from (at most MAX_CITED), newest first. */
  readonly citedTx: readonly string[]
  /** Questions it can answer, offered with the refusal. */
  readonly suggestions: readonly string[]
}

export const refusal = (): Answer => ({ answer: REFUSAL, citedTx: [], suggestions: SUGGESTED })

const NOUN: Record<Kind | 'all', readonly [one: string, many: string]> = {
  all: ['settlement', 'settlements'],
  invoice: ['invoice the AgentVault paid', 'invoices the AgentVault paid'],
  router: ['payment through the PayRouter', 'payments through the PayRouter'],
  x402: ['x402 purchase by the research agent', 'x402 purchases by the research agent'],
}

const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
const WHEN = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dayLabel = (day: string) => DAY.format(new Date(`${day}T00:00:00Z`))

/**
 * "株式会社メイギ商事 (t2011001234567.payee.eth)": the registered name, then the payout name. A payee that isn't
 * active has no name in the rows (the settlements panel shows none), so it is its payout name alone.
 */
export function payeeLabel(payee: Payee): string {
  return payee.legalName ? `${payee.legalName} (${payee.ens})` : payee.ens
}

/** When a row settled, as the panel shows it: "on 26 Sept 2026, 15:47 JST", or its block when the time is unknown. */
function whenOf(row: Settlement): string {
  return row.at ? `on ${WHEN.format(new Date(row.at))} JST` : `at block ${row.blockNumber}`
}

/** " on 26 Sept 2026 (JST)", " from … to … (JST)", " since …", " until …", or nothing. */
function rangeOf(query: Query): string {
  const { from, to } = query
  if (from && to && from === to) return ` on ${dayLabel(from)} (JST)`
  if (from && to) return ` from ${dayLabel(from)} to ${dayLabel(to)} (JST)`
  if (from) return ` since ${dayLabel(from)} (JST)`
  return to ? ` until ${dayLabel(to)} (JST)` : ''
}

/** What the query covers: "x402 purchases by the research agent from 株式会社フジデータ (…) on 26 Sept 2026". */
function describe(query: Query, count: number): string {
  const kind = query.kind ?? 'all'
  const noun = NOUN[kind][count === 1 ? 0 : 1]
  const payee = query.payee ? ` ${kind === 'x402' ? 'from' : 'to'} ${payeeLabel(query.payee)}` : ''
  return `${noun}${payee}${rangeOf(query)}`
}

const cite = (rows: readonly Settlement[]) => rows.slice(0, MAX_CITED).map((row) => row.txHash)
const said = (answer: string, rows: readonly Settlement[]): Answer => ({ answer, citedTx: cite(rows), suggestions: [] })
const payeeOf = (row: Settlement): Payee => ({ tNumber: row.tNumber, ens: row.ens, legalName: row.legalName })

/** "The most recent settlement was ¥10 to …, on …", or, for one payee, "… to <payee> was ¥10, on …". */
function oneRow(query: Query, which: 'most recent' | 'largest', row: Settlement): Answer {
  const subject = `The ${which} ${describe(query, 1)}`
  const to = query.payee ? '' : ` to ${payeeLabel(payeeOf(row))}`
  return said(`${subject} was ${row.amount.display}${to}, ${whenOf(row)}.`, [row])
}

function listed(query: Query, rows: readonly Settlement[]): Answer {
  const shown = rows.slice(0, query.limit)
  const head =
    shown.length === 1
      ? `The most recent ${describe(query, 1)}:`
      : `The ${shown.length} most recent ${describe(query, 2)}:`
  const lines = shown.map((row) => `${row.amount.display} to ${payeeLabel(payeeOf(row))}, ${whenOf(row)}`)
  return said([head, ...lines].join('\n'), shown)
}

function topPayee(query: Query, rows: readonly Settlement[]): Answer {
  const top = mostPaid(rows)
  const first = top?.rows[0]
  if (!top || !first) return refusal()
  const across = `${top.rows.length} ${describe(query, top.rows.length)}`
  return said(`${payeeLabel(payeeOf(first))} has been paid the most: ${yenOf(top.total)} across ${across}.`, top.rows)
}

/** The answer to a checked query, from the rows (newest first) alone. */
export function answerFor(query: Query, rows: readonly Settlement[]): Answer {
  // "Who has been paid the most" ranks every payee, so a payee in the reading narrows nothing.
  const scope = query.intent === 'most_paid' ? { ...query, payee: null } : query
  const found = matching(rows, scope)
  const [newest] = found
  if (!newest) return said(`There are no ${describe(scope, 2)}.`, [])
  const n = found.length
  switch (scope.intent) {
    case 'total_paid':
      return said(`${totalOf(found)} in total, across ${n} ${describe(scope, n)}.`, found)
    case 'count':
      return said(`There ${n === 1 ? 'is' : 'are'} ${n} ${describe(scope, n)}.`, found)
    case 'latest':
      return oneRow(scope, 'most recent', newest)
    case 'largest':
      return oneRow(scope, 'largest', largestOf(found) ?? newest)
    case 'most_paid':
      return topPayee(scope, found)
    case 'list':
      return listed(scope, found)
  }
}

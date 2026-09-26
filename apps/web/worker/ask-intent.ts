// "Ask the ledger": the model only reads the question into one of a few fixed queries. This checks that reading
// against the rows before anything is computed: a payee must be one the rows name, a kind one of the three, dates real
// ISO days. Anything else, or "unknown", is no query, and the visitor gets the fixed refusal. The model's words are
// never shown.

import type { Kind, Settlement } from './settlements'

export const INTENTS = ['total_paid', 'count', 'latest', 'largest', 'most_paid', 'list', 'unknown'] as const
export type Intent = Exclude<(typeof INTENTS)[number], 'unknown'>
export const KINDS = ['invoice', 'router', 'x402'] as const satisfies readonly Kind[]
export const MAX_LIST = 5

/** A payee the rows name. The model may only pick one of these, by T-number. */
export interface Payee {
  readonly tNumber: string
  readonly ens: string
  readonly legalName: string | null
}

export interface Query {
  readonly intent: Intent
  readonly payee: Payee | null
  readonly kind: Kind | null
  /** YYYY-MM-DD, a day in Japan time; both ends are inclusive. */
  readonly from: string | null
  readonly to: string | null
  /** For "list" only: 1 to MAX_LIST. */
  readonly limit: number
}

/** The payees in the rows, once each, in the order the rows name them (newest first). */
export function payeesOf(rows: readonly Settlement[]): Payee[] {
  const payees = new Map<string, Payee>()
  for (const row of rows) {
    if (!payees.has(row.tNumber))
      payees.set(row.tNumber, { tNumber: row.tNumber, ens: row.ens, legalName: row.legalName })
  }
  return [...payees.values()]
}

const INVALID = Symbol('invalid')
type Checked<T> = T | null | typeof INVALID

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const T_NUMBER = /^T?(\d{13})$/i
const absent = (value: unknown) => value === undefined || value === null || value === ''

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One of the rows' payees, named by T-number, ENS name or exact legal name. */
function payeeParam(value: unknown, payees: readonly Payee[]): Checked<Payee> {
  if (absent(value)) return null
  if (typeof value !== 'string') return INVALID
  const text = value.trim()
  const digits = T_NUMBER.exec(text)?.[1]
  const found = payees.find((payee) =>
    digits ? payee.tNumber === `T${digits}` : payee.ens === text.toLowerCase() || payee.legalName === text,
  )
  return found ?? INVALID
}

function kindParam(value: unknown): Checked<Kind> {
  if (absent(value)) return null
  return KINDS.find((kind) => kind === value) ?? INVALID
}

/** A real calendar day as YYYY-MM-DD ("2026-02-30" is not one). */
function dayParam(value: unknown): Checked<string> {
  if (absent(value)) return null
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return INVALID
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : INVALID
}

/** A whole number from 1; more than MAX_LIST lists MAX_LIST. */
function limitParam(value: unknown): number | typeof INVALID {
  if (absent(value)) return MAX_LIST
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? Math.min(value, MAX_LIST) : INVALID
}

const isIntent = (value: unknown): value is Intent => value !== 'unknown' && INTENTS.some((intent) => intent === value)

/** The model's reading as a query over the rows, or null when it is "unknown" or anything in it is off. */
export function queryOf(reading: unknown, payees: readonly Payee[]): Query | null {
  if (!isObject(reading) || !isIntent(reading.intent)) return null
  const params = reading.params ?? {}
  if (!isObject(params)) return null
  const payee = payeeParam(params.payee, payees)
  const kind = kindParam(params.kind)
  const from = dayParam(params.from)
  const to = dayParam(params.to)
  const limit = limitParam(params.limit)
  if (payee === INVALID || kind === INVALID || from === INVALID || to === INVALID || limit === INVALID) return null
  if (from && to && from > to) return null
  return { intent: reading.intent, payee, kind, from, to, limit }
}

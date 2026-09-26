// "Ask the ledger": which rows a query covers, and the exact arithmetic over them. Amounts are added as base units of
// 18 decimals, never as floats; days are Japan time, as the settlements panel shows them.

import type { Query } from './ask-intent'
import { yen } from './rows'
import type { Settlement } from './settlements'

const SCALE = 18
const JST_MS = 9 * 60 * 60 * 1000 // Japan has no daylight saving time

/** "¥55,000" or "¥15.5" → base units of 18 decimals. Every row's display comes from rows.ts, so one that isn't is a bug. */
export function parseYen(display: string): bigint {
  const match = /^¥([\d,]+)(?:\.(\d{1,18}))?$/.exec(display)
  if (!match?.[1]) throw new Error('unreadable settlement amount')
  return BigInt(match[1].replace(/,/g, '')) * 10n ** BigInt(SCALE) + BigInt((match[2] ?? '').padEnd(SCALE, '0'))
}

/** The rows' amounts added up exactly, as rows.ts shows an amount ("¥88,015.5"). */
export function totalOf(rows: readonly Settlement[]): string {
  return yen(
    rows.reduce((sum, row) => sum + parseYen(row.amount.display), 0n),
    SCALE,
  )
}

/** The row with the largest amount; on a tie, the most recent (rows are newest first). */
export function largestOf(rows: readonly Settlement[]): Settlement | null {
  let best: Settlement | null = null
  for (const row of rows) if (!best || parseYen(row.amount.display) > parseYen(best.amount.display)) best = row
  return best
}

/** A time as a day in Japan: "2026-09-26". */
export function jstDay(time: number): string {
  return new Date(time + JST_MS).toISOString().slice(0, 10)
}

function inRange(row: Settlement, from: string | null, to: string | null): boolean {
  if (!from && !to) return true
  if (!row.at) return false // a row without a time can't be placed in a range
  const day = jstDay(Date.parse(row.at))
  return (!from || day >= from) && (!to || day <= to)
}

/** The rows a query covers, newest first as the API serves them. */
export function matching(rows: readonly Settlement[], query: Query): Settlement[] {
  return rows.filter(
    (row) =>
      (!query.payee || row.tNumber === query.payee.tNumber) &&
      (!query.kind || row.kind === query.kind) &&
      inRange(row, query.from, query.to),
  )
}

export interface PayeeTotal {
  readonly rows: readonly Settlement[]
  readonly total: bigint
}

/** The payee paid the most across the rows, with its rows; on a tie, the one paid most recently. */
export function mostPaid(rows: readonly Settlement[]): PayeeTotal | null {
  const byPayee = new Map<string, { rows: Settlement[]; total: bigint }>()
  for (const row of rows) {
    const entry = byPayee.get(row.tNumber) ?? { rows: [], total: 0n }
    entry.rows.push(row)
    entry.total += parseYen(row.amount.display)
    byPayee.set(row.tNumber, entry)
  }
  let best: PayeeTotal | null = null
  for (const entry of byPayee.values()) if (!best || entry.total > best.total) best = entry
  return best
}

export const yenOf = (units: bigint) => yen(units, SCALE)

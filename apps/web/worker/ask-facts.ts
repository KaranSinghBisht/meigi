// "Ask the ledger": the facts the model may use, worked out here so it never adds anything up itself, and the values
// an answer is allowed to mention (every tx hash, payout, amount and number in the rows or these facts).

import { yen } from './rows'
import type { Kind, Settlement, SettlementsBody } from './settlements'

const SCALE = 18 // amounts are summed exactly, as base units of 18 decimals
const KIND_LABEL: Record<Kind, string> = {
  invoice: 'invoices the AgentVault paid',
  router: 'payments by T-number through the PayRouter',
  x402: 'x402 purchases by the research agent',
}

export interface Facts {
  readonly source: string
  readonly asOf: string
  readonly indexedFromBlock: number
  readonly settlements: number
  readonly total: string
  readonly first: string | null
  readonly latest: string | null
  readonly byKind: readonly { readonly kind: string; readonly settlements: number; readonly total: string }[]
  readonly byPayee: readonly {
    readonly tNumber: string
    readonly name: string
    readonly ens: string
    readonly settlements: number
    readonly total: string
    readonly latest: string | null
  }[]
  readonly largest: { readonly txHash: string; readonly amount: string; readonly tNumber: string } | null
}

/** What an answer may mention: lower-cased hashes and payouts, and numbers as plain decimals ("55000", "15.5"). */
export interface Allowed {
  readonly hashes: ReadonlySet<string>
  readonly addresses: ReadonlySet<string>
  readonly amounts: ReadonlySet<string>
  readonly numbers: ReadonlySet<string>
}

/** "¥55,000" or "¥15.5" → base units of 18 decimals; anything else → null. */
export function parseYen(display: string): bigint | null {
  const match = /^¥([\d,]+)(?:\.(\d{1,18}))?$/.exec(display)
  if (!match?.[1]) return null
  const fraction = (match[2] ?? '').padEnd(SCALE, '0')
  return BigInt(match[1].replace(/,/g, '')) * 10n ** BigInt(SCALE) + BigInt(fraction)
}

/** A decimal as the guard compares it: no thousands separators, no trailing zeros after the point. */
export function plainNumber(text: string): string {
  const bare = text.replace(/[,\s]/g, '')
  return bare.includes('.') ? bare.replace(/\.?0+$/, '') : bare.replace(/^0+(?=\d)/, '')
}

const sum = (rows: readonly Settlement[]) =>
  rows.reduce((total, row) => total + (parseYen(row.amount.display) ?? 0n), 0n)
const total = (rows: readonly Settlement[]) => yen(sum(rows), SCALE)
const latestAt = (rows: readonly Settlement[]) => rows.find((row) => row.at)?.at ?? null // rows are newest first

function groupBy<K>(rows: readonly Settlement[], key: (row: Settlement) => K): Map<K, Settlement[]> {
  const groups = new Map<K, Settlement[]>()
  for (const row of rows) groups.set(key(row), [...(groups.get(key(row)) ?? []), row])
  return groups
}

function largestOf(rows: readonly Settlement[]): Facts['largest'] {
  let best: Settlement | null = null
  for (const row of rows)
    if (!best || (parseYen(row.amount.display) ?? 0n) > (parseYen(best.amount.display) ?? 0n)) best = row
  return best ? { txHash: best.txHash, amount: best.amount.display, tNumber: best.tNumber } : null
}

export function factsOf(body: SettlementsBody): Facts {
  const rows = body.settlements
  const dated = rows.filter((row) => row.at)
  return {
    source: `${body.indexer}, ${body.network}`,
    asOf: body.asOf,
    indexedFromBlock: body.indexedFrom,
    settlements: rows.length,
    total: total(rows),
    first: dated.at(-1)?.at ?? null,
    latest: latestAt(rows),
    byKind: [...groupBy(rows, (row) => row.kind)].map(([kind, group]) => ({
      kind: KIND_LABEL[kind],
      settlements: group.length,
      total: total(group),
    })),
    byPayee: [...groupBy(rows, (row) => row.tNumber)].map(([tNumber, group]) => ({
      tNumber,
      name: group[0]?.legalName ?? '(name withheld while disputed)',
      ens: group[0]?.ens ?? '',
      settlements: group.length,
      total: total(group),
      latest: latestAt(group),
    })),
    largest: largestOf(rows),
  }
}

function amountsIn(facts: Facts, rows: readonly Settlement[]): string[] {
  const shown = [
    facts.total,
    ...facts.byKind.map((kind) => kind.total),
    ...facts.byPayee.map((payee) => payee.total),
    ...rows.map((row) => row.amount.display),
  ]
  return shown.map((display) => plainNumber(display.replace(/^¥/, '')))
}

export function allowedIn(facts: Facts, rows: readonly Settlement[]): Allowed {
  const amounts = new Set(amountsIn(facts, rows))
  const counts = [
    facts.settlements,
    ...facts.byKind.map((k) => k.settlements),
    ...facts.byPayee.map((p) => p.settlements),
  ]
  const numbers = new Set([
    ...amounts,
    ...counts.map(String),
    String(facts.indexedFromBlock),
    ...rows.map((row) => String(row.blockNumber)),
    ...rows.map((row) => row.tNumber.replace(/^T/, '')),
  ])
  return {
    hashes: new Set(rows.map((row) => row.txHash.toLowerCase())),
    addresses: new Set(rows.map((row) => row.payout.toLowerCase())),
    amounts,
    numbers,
  }
}

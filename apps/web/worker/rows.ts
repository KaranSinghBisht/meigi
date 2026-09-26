// Parsing MultiBaas's saved-query rows into typed payments. MultiBaas is a trust boundary too: a row that doesn't
// have the expected shape fails the whole answer (Upstream) rather than showing a half-read payment.

import { Upstream } from './multibaas'

/** An InvoicePaid (vault) or Paid (router) row: meigi_invoices_paid and meigi_router_paid select the same aliases. */
export interface IndexedPayment {
  readonly txHash: string
  readonly blockNumber: number
  readonly at: string | null
  readonly digits: string // the T-number without its "T"
  readonly payout: string
  readonly amount: bigint
}

/** A PayRouter Paid row: meigi_router_paid also selects the token paid in. */
export interface RoutedPayment extends IndexedPayment {
  readonly token: string // lowercase
}

/** An mJPYC Transfer row (meigi_mjpy_transfers). */
export interface IndexedTransfer {
  readonly txHash: string
  readonly blockNumber: number
  readonly at: string | null
  readonly sender: string // lowercase
  readonly recipient: string
  readonly amount: bigint
}

const HASH = /^0x[0-9a-fA-F]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

function fail(what: string): never {
  throw new Upstream(`MultiBaas returned a row with an unexpected ${what}`)
}

function hash(value: unknown): string {
  return typeof value === 'string' && HASH.test(value) ? value : fail('transaction hash')
}

function address(value: unknown): string {
  return typeof value === 'string' && ADDRESS.test(value) ? value : fail('address')
}

function uint(value: unknown, what: string): bigint {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === 'string' && /^\d{1,78}$/.test(value)) return BigInt(value)
  return fail(what)
}

function block(value: unknown): number {
  const n = uint(value, 'block number')
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : fail('block number')
}

/** MultiBaas's triggered_at ("2026-09-26 05:32:12+00") as ISO 8601 ("2026-09-26T05:32:12.000Z"), or null. */
function time(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec(value.trim())
  if (!m) return null
  const zone = !m[3] || m[3] === 'Z' ? 'Z' : m[3].length === 3 ? `${m[3]}:00` : m[3].replace(/^([+-]\d{2})(\d{2})$/, '$1:$2')
  const ms = Date.parse(`${m[1]}T${m[2]}${zone}`)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

export function paymentRow(row: Record<string, unknown>): IndexedPayment {
  const digits = uint(row.tnumber, 'T-number').toString()
  if (digits.length > 13) fail('T-number')
  return {
    txHash: hash(row.txhash),
    blockNumber: block(row.block),
    at: time(row.at),
    digits: digits.padStart(13, '0'),
    payout: address(row.payout),
    amount: uint(row.amount, 'amount'),
  }
}

export function routerRow(row: Record<string, unknown>): RoutedPayment {
  return { ...paymentRow(row), token: address(row.token).toLowerCase() }
}

export function transferRow(row: Record<string, unknown>): IndexedTransfer {
  return {
    txHash: hash(row.txhash),
    blockNumber: block(row.block),
    at: time(row.at),
    sender: address(row.sender).toLowerCase(),
    recipient: address(row.recipient),
    amount: uint(row.amount, 'amount'),
  }
}

/** Token units as yen: "¥1,234", with a fraction only when there is one. */
export function yen(units: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals)
  const whole = (units / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const fraction = units % scale
  if (fraction === 0n) return `¥${whole}`
  return `¥${whole}.${fraction.toString().padStart(decimals, '0').replace(/0+$/, '')}`
}

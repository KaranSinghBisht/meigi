// GET /api/settlements[?tNumber=T…]: the payments Meigi's contracts settled on Sepolia, as Curvegrid MultiBaas
// indexed them, newest first. Three kinds:
//   invoice: the AgentVault's InvoicePaid (the AP agent paid an invoice);
//   router:  the PayRouter's Paid in mJPYC (PayRouter takes any token, so others are not settlements);
//   x402:    mJPYC from the x402 research agent's wallet to a registered payout (mJPYC is mintable, so only that
//            wallet's transfers count), unless the same transaction is already one of the two above.
// mJPYC is a demo token anyone can mint, so anyone can make a real router payment to a registered payee, and it is
// listed as a router row: a real payment to that payee through Meigi's router, though not one Meigi's agent made.
// MultiBaas is read into one snapshot of everything in scope: the SETTLEMENT_PAYEES and every payee the vault or
// router paid, at most MAX_PAYEES. It is served for 3 min from when it was read, shared per data centre (Workers Cache
// API) and kept per isolate. A refresh costs MultiBaas the three queries: the reads that rarely change are cached apart from it (payeeOf for
// 10 min; the token alias, its decimals and the indexing start for an hour). A T-number outside the scope answers
// empty and costs MultiBaas nothing. A missing or wrong setting answers 503, like an outage, and the log says which.

import { createMemo, type Memo } from './memo'
import { isRecord, Upstream, type MultiBaasReader } from './multibaas'
import { paymentRow, routerRow, transferRow, yen, type IndexedPayment } from './rows'

export type Kind = 'invoice' | 'router' | 'x402'

export interface Settlement {
  readonly kind: Kind
  readonly txHash: string
  readonly blockNumber: number
  readonly at: string | null
  readonly tNumber: string
  readonly ens: string
  readonly legalName: string | null
  readonly payout: string
  readonly amount: { readonly units: string; readonly display: string }
}

/** Everything in scope, as read from MultiBaas at `asOf`. JSON-safe, so it can be shared through the edge cache. */
export interface Snapshot {
  readonly asOf: string
  readonly indexedFrom: number // MultiBaas indexes from this block; older payments are not in it
  readonly scope: readonly string[] // "T…"
  readonly settlements: readonly Settlement[] // newest first, uncapped
}

export interface SettlementsBody {
  readonly indexer: 'Curvegrid MultiBaas'
  readonly network: 'Sepolia'
  readonly chainId: 11155111
  readonly asOf: string
  readonly indexedFrom: number
  readonly tNumber: string | null
  readonly settlements: readonly Settlement[]
}

/** Where a snapshot is shared between isolates: the Workers Cache API in production. What it returns is checked. */
export interface SnapshotStore {
  get(): Promise<unknown>
  put(snapshot: Snapshot): Promise<void>
}

/** A setting is missing or malformed, or MultiBaas disagrees with it. Answered like an outage, and logged. */
export class Misconfigured extends Error {
  override readonly name = 'Misconfigured'
}

export const SNAPSHOT_EDGE_S = 180
const SNAPSHOT_ISOLATE_MS = 180_000 // from when it was read, so an edge copy is kept only for what is left
const PAYEE_MS = 10 * 60_000 // payeeOf: a payout change waits 72 h in the registry; a dispute shows within 10 min
const STABLE_MS = 60 * 60_000 // the token alias, its decimals and the indexing start: fixed for a deployment
const MAX_PAYEES = 20 // a cold snapshot costs 6 + MAX_PAYEES MultiBaas calls, well under a Worker's 50 subrequests
const MAX_ROWS = 50
const T_NUMBER = /^T?(\d{13})$/i
const ADDRESS = /^0x[0-9a-fA-F]{40}$/
const HASH = /^0x[0-9a-fA-F]{64}$/
const KINDS = new Set<string>(['invoice', 'router', 'x402'] satisfies Kind[])

/** "T2011001234567" (or the bare 13 digits) → its 13 digits; anything else → null. */
export function tNumberDigits(value: string): string | null {
  return T_NUMBER.exec(value.trim())?.[1] ?? null
}

export interface SettlementsOptions {
  readonly payees: readonly string[] // SETTLEMENT_PAYEES
  readonly token: string | null // SETTLEMENT_TOKEN
  readonly x402Buyer: string | null // X402_BUYER
  readonly store?: SnapshotStore
  readonly memo?: Memo
  readonly now?: () => number
}

export interface SettlementsApi {
  list(digits: string | null): Promise<SettlementsBody>
}

/** What a snapshot covers, from the settings. */
interface Scope {
  readonly known: readonly string[] // T-number digits
  readonly token: string // lowercase
  readonly buyer: string // lowercase
}

function scopeOf(options: SettlementsOptions): Scope | Misconfigured {
  const address = (value: string | null) => (value && ADDRESS.test(value) ? value.toLowerCase() : null)
  const token = address(options.token)
  const buyer = address(options.x402Buyer)
  if (!token) return new Misconfigured('SETTLEMENT_TOKEN is missing or not an address')
  if (!buyer) return new Misconfigured('X402_BUYER is missing or not an address')
  return { known: options.payees.flatMap((entry) => tNumberDigits(entry) ?? []), token, buyer }
}

/** The reads that rarely change, cached apart from the snapshot, so that a refresh costs only the three queries. */
function stableReads(reader: MultiBaasReader, memo: Memo): MultiBaasReader {
  return {
    rows: (query) => reader.rows(query),
    payee: (digits) => memo(`payee:${digits}`, PAYEE_MS, () => reader.payee(digits)),
    decimals: () => memo('decimals', STABLE_MS, () => reader.decimals()),
    indexedFrom: () => memo('indexedFrom', STABLE_MS, () => reader.indexedFrom()),
    tokenAddress: () => memo('token', STABLE_MS, () => reader.tokenAddress()),
  }
}

export function createSettlements(reader: MultiBaasReader, options: SettlementsOptions): SettlementsApi {
  const configured = scopeOf(options)
  const memo = options.memo ?? createMemo()
  const now = options.now ?? Date.now
  const reads = stableReads(reader, memo)

  async function fresh(scope: Scope): Promise<Snapshot> {
    // Checked first, so a wrong alias costs no queries: the saved ones filter on SETTLEMENT_TOKEN.
    if ((await reads.tokenAddress()) !== scope.token) throw new Misconfigured('the meigi_mjpy alias in MultiBaas is not SETTLEMENT_TOKEN')
    const snapshot = await readSnapshot(reads, scope, new Date(now()).toISOString())
    await options.store?.put(snapshot).catch((error: unknown) => {
      console.error(`[settlements] could not share the snapshot: ${error instanceof Error ? error.name : 'error'}`)
    })
    return snapshot
  }
  // The edge copy is used only while it is younger than SNAPSHOT_EDGE_S, whatever the cache itself keeps.
  const shared = async (): Promise<Snapshot | null> => {
    const copy = parseSnapshot(await options.store?.get())
    return copy && now() - Date.parse(copy.asOf) < SNAPSHOT_EDGE_S * 1000 ? copy : null
  }
  const life = (s: Snapshot) => SNAPSHOT_ISOLATE_MS - (now() - Date.parse(s.asOf))
  const snapshot = (scope: Scope) => memo<Snapshot>('snapshot', life, async () => (await shared()) ?? fresh(scope))

  return {
    async list(digits) {
      if (configured instanceof Misconfigured) throw configured
      const s = await snapshot(configured)
      const tNumber = digits ? `T${digits}` : null
      const rows = tNumber ? s.settlements.filter((row) => row.tNumber === tNumber) : s.settlements
      return { indexer: 'Curvegrid MultiBaas', network: 'Sepolia', chainId: 11155111, asOf: s.asOf, indexedFrom: s.indexedFrom, tNumber, settlements: rows.slice(0, MAX_ROWS) }
    },
  }
}

async function readSnapshot(reader: MultiBaasReader, scope: Scope, asOf: string): Promise<Snapshot> {
  const [invoices, routed, transfers, decimals, indexedFrom] = await Promise.all([
    reader.rows('meigi_invoices_paid'),
    reader.rows('meigi_router_paid'),
    reader.rows('meigi_mjpy_transfers'),
    reader.decimals(),
    reader.indexedFrom(),
  ])
  const vault = invoices.map(paymentRow)
  const router = routed.map(routerRow).filter((p) => p.token === scope.token) // the saved query filters too; this is the check
  const payees = [...new Set([...scope.known, ...vault.map((p) => p.digits), ...router.map((p) => p.digits)])].slice(0, MAX_PAYEES)
  const records = new Map(await Promise.all(payees.map(async (d) => [d, await reader.payee(d)] as const)))
  const byPayout = new Map([...records].flatMap(([d, payee]) => (payee.payout ? [[payee.payout.toLowerCase(), d] as const] : [])))
  const settledTxs = new Set([...vault, ...router].map((p) => p.txHash.toLowerCase()))

  const row = (kind: Kind, d: string, p: Pick<IndexedPayment, 'txHash' | 'blockNumber' | 'at' | 'payout' | 'amount'>): Settlement => ({
    kind,
    txHash: p.txHash,
    blockNumber: p.blockNumber,
    at: p.at,
    tNumber: `T${d}`,
    ens: `t${d}.payee.eth`,
    legalName: records.get(d)?.legalName ?? null,
    payout: p.payout,
    amount: { units: p.amount.toString(), display: yen(p.amount, decimals) },
  })
  const x402 = transfers.map(transferRow).flatMap((t) => {
    const d = byPayout.get(t.recipient.toLowerCase())
    return d && t.sender === scope.buyer && !settledTxs.has(t.txHash.toLowerCase()) ? [row('x402', d, { ...t, payout: t.recipient })] : []
  })
  const settlements = [
    ...vault.filter((p) => records.has(p.digits)).map((p) => row('invoice', p.digits, p)),
    ...router.filter((p) => records.has(p.digits)).map((p) => row('router', p.digits, p)),
    ...x402,
  ].sort((a, b) => b.blockNumber - a.blockNumber || a.txHash.localeCompare(b.txHash))
  return { asOf, indexedFrom, scope: payees.map((d) => `T${d}`), settlements }
}

const isTNumber = (value: unknown): value is string => typeof value === 'string' && /^T\d{13}$/.test(value)
const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))

/** One row of a shared snapshot, held to what readSnapshot writes. */
function isSettlement(value: unknown): value is Settlement {
  if (!isRecord(value) || !isRecord(value.amount) || !isTNumber(value.tNumber)) return false
  const { kind, txHash, blockNumber, at, legalName, payout } = value
  const amount = value.amount
  return (
    typeof kind === 'string' && KINDS.has(kind) &&
    typeof txHash === 'string' && HASH.test(txHash) &&
    typeof blockNumber === 'number' && Number.isSafeInteger(blockNumber) && blockNumber >= 0 &&
    (at === null || isTime(at)) &&
    value.ens === `${value.tNumber.toLowerCase()}.payee.eth` &&
    (legalName === null || typeof legalName === 'string') &&
    typeof payout === 'string' && ADDRESS.test(payout) &&
    typeof amount.units === 'string' && /^\d{1,78}$/.test(amount.units) && typeof amount.display === 'string'
  )
}

/** A snapshot read back from the edge cache: ours, but every row is still checked before use. Anything else is null. */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value) || !isTime(value.asOf) || typeof value.indexedFrom !== 'number' || !Number.isSafeInteger(value.indexedFrom)) return null
  if (!Array.isArray(value.scope) || !value.scope.every(isTNumber)) return null
  if (!Array.isArray(value.settlements) || !value.settlements.every(isSettlement)) return null
  return value as unknown as Snapshot
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' }

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, 'cache-control': cache } })
}

/** The HTTP side: validates the one parameter, and turns any MultiBaas or settings trouble into one generic answer. */
export async function settlementsResponse(url: URL, api: SettlementsApi): Promise<Response> {
  const raw = url.searchParams.get('tNumber')
  const digits = raw === null ? null : tNumberDigits(raw)
  if (raw !== null && !digits) return json({ code: 'invalid_t_number', message: 'tNumber must be T followed by 13 digits.' }, 400, 'no-store')
  try {
    return json(await api.list(digits), 200, 'public, max-age=60')
  } catch (error) {
    if (!(error instanceof Upstream) && !(error instanceof Misconfigured)) throw error
    console.error(`[settlements] ${error.name}: ${error.message}`)
    return json({ code: 'settlements_unavailable', message: 'Settlements are unavailable right now.' }, 503, 'no-store')
  }
}

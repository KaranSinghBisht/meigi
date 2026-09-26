// GET /api/settlements[?tNumber=T…]: the payments Meigi's contracts settled on Sepolia, as Curvegrid MultiBaas
// indexed them, newest first. Three kinds:
//   invoice: the AgentVault's InvoicePaid (the AP agent paid an invoice);
//   router:  the PayRouter's Paid in mJPYC (PayRouter takes any token, so others are not settlements);
//   x402:    mJPYC from the x402 research agent's wallet to a registered payout (mJPYC is mintable, so only that
//            wallet's transfers count), unless the same transaction is already one of the two above.
// MultiBaas is read into one snapshot of everything in scope: the SETTLEMENT_PAYEES and every payee the vault or
// router paid, at most MAX_PAYEES. It is shared per data centre for 3 min (Workers Cache API) and kept per isolate for
// 30 s. A T-number outside the scope answers empty and costs MultiBaas nothing.

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

/** Where a snapshot is shared between isolates: the Workers Cache API in production, nothing in tests. */
export interface SnapshotStore {
  get(): Promise<Snapshot | null>
  put(snapshot: Snapshot): Promise<void>
}

export const SNAPSHOT_EDGE_S = 180
const SNAPSHOT_ISOLATE_MS = 30_000
const MAX_PAYEES = 20 // a cold snapshot costs 6 + MAX_PAYEES MultiBaas calls, well under a Worker's 50 subrequests
const MAX_ROWS = 50
const T_NUMBER = /^T?(\d{13})$/i
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

/** "T2011001234567" (or the bare 13 digits) → its 13 digits; anything else → null. */
export function tNumberDigits(value: string): string | null {
  return T_NUMBER.exec(value.trim())?.[1] ?? null
}

export interface SettlementsOptions {
  readonly payees: readonly string[] // SETTLEMENT_PAYEES
  readonly x402Buyer: string | null // X402_BUYER
  readonly store?: SnapshotStore
  readonly memo?: Memo
  readonly now?: () => number
}

export interface SettlementsApi {
  list(digits: string | null): Promise<SettlementsBody>
}

export function createSettlements(reader: MultiBaasReader, options: SettlementsOptions): SettlementsApi {
  const known = options.payees.flatMap((entry) => tNumberDigits(entry) ?? [])
  const buyer = options.x402Buyer && ADDRESS.test(options.x402Buyer) ? options.x402Buyer.toLowerCase() : null
  const memo = options.memo ?? createMemo()
  const now = options.now ?? Date.now

  async function fresh(): Promise<Snapshot> {
    const snapshot = await readSnapshot(reader, known, buyer, new Date(now()).toISOString())
    await options.store?.put(snapshot).catch((error: unknown) => {
      console.error(`[settlements] could not share the snapshot: ${error instanceof Error ? error.name : 'error'}`)
    })
    return snapshot
  }
  const snapshot = () => memo<Snapshot>('snapshot', SNAPSHOT_ISOLATE_MS, async () => (await options.store?.get()) ?? fresh())

  return {
    async list(digits) {
      const s = await snapshot()
      const tNumber = digits ? `T${digits}` : null
      const rows = tNumber ? s.settlements.filter((row) => row.tNumber === tNumber) : s.settlements
      return { indexer: 'Curvegrid MultiBaas', network: 'Sepolia', chainId: 11155111, asOf: s.asOf, indexedFrom: s.indexedFrom, tNumber, settlements: rows.slice(0, MAX_ROWS) }
    },
  }
}

async function readSnapshot(reader: MultiBaasReader, known: readonly string[], buyer: string | null, asOf: string): Promise<Snapshot> {
  const [invoices, routed, transfers, decimals, indexedFrom, token] = await Promise.all([
    reader.rows('meigi_invoices_paid'),
    reader.rows('meigi_router_paid'),
    buyer ? reader.rows('meigi_mjpy_transfers') : Promise.resolve([]),
    reader.decimals(),
    reader.indexedFrom(),
    reader.tokenAddress(),
  ])
  const vault = invoices.map(paymentRow)
  const router = routed.map(routerRow).filter((p) => p.token === token) // the saved query filters too; this is the check
  const scope = [...new Set([...known, ...vault.map((p) => p.digits), ...router.map((p) => p.digits)])].slice(0, MAX_PAYEES)
  const records = new Map(await Promise.all(scope.map(async (d) => [d, await reader.payee(d)] as const)))
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
    return d && t.sender === buyer && !settledTxs.has(t.txHash.toLowerCase()) ? [row('x402', d, { ...t, payout: t.recipient })] : []
  })
  const settlements = [
    ...vault.filter((p) => records.has(p.digits)).map((p) => row('invoice', p.digits, p)),
    ...router.filter((p) => records.has(p.digits)).map((p) => row('router', p.digits, p)),
    ...x402,
  ].sort((a, b) => b.blockNumber - a.blockNumber || a.txHash.localeCompare(b.txHash))
  return { asOf, indexedFrom, scope: scope.map((d) => `T${d}`), settlements }
}

/** A snapshot read back from the edge cache: ours, but still checked before use. */
export function parseSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value) || typeof value.asOf !== 'string' || typeof value.indexedFrom !== 'number') return null
  if (!Array.isArray(value.scope) || !Array.isArray(value.settlements) || !value.settlements.every(isRecord)) return null
  return value as unknown as Snapshot
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' }

function json(body: unknown, status: number, cache: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, 'cache-control': cache } })
}

/** The HTTP side: validates the one parameter, and turns any MultiBaas trouble into one generic answer. */
export async function settlementsResponse(url: URL, api: SettlementsApi): Promise<Response> {
  const raw = url.searchParams.get('tNumber')
  const digits = raw === null ? null : tNumberDigits(raw)
  if (raw !== null && !digits) return json({ code: 'invalid_t_number', message: 'tNumber must be T followed by 13 digits.' }, 400, 'no-store')
  try {
    return json(await api.list(digits), 200, 'public, max-age=60')
  } catch (error) {
    if (!(error instanceof Upstream)) throw error
    console.error(`[settlements] ${error.message}`)
    return json({ code: 'settlements_unavailable', message: 'Settlements are unavailable right now.' }, 503, 'no-store')
  }
}

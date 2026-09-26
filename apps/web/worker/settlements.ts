// GET /api/settlements[?tNumber=T…]: the payments Meigi's contracts settled on Sepolia, as Curvegrid MultiBaas
// indexed them, newest first. Three kinds:
//   invoice:  the AgentVault's InvoicePaid (the AP agent paid an invoice);
//   router:   the PayRouter's Paid (someone paid a T-number);
//   transfer: mJPYC sent straight to a registered payout (an x402 sale), unless the same transaction is already one
//             of the two above.
// MultiBaas's rows are cached for 45 s; registry records, the token's decimals and the indexing start for 10 min.

import { createMemo, type Memo } from './memo'
import { Upstream, type MultiBaasReader, type Payee } from './multibaas'
import { paymentRow, transferRow, yen, type IndexedPayment, type IndexedTransfer } from './rows'

export type Kind = 'invoice' | 'router' | 'transfer'

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

export interface SettlementsBody {
  readonly indexer: 'Curvegrid MultiBaas'
  readonly network: 'Sepolia'
  readonly chainId: 11155111
  readonly indexedFrom: number // MultiBaas indexes from this block; older payments are not in it
  readonly tNumber: string | null
  readonly settlements: readonly Settlement[]
}

const ROWS_MS = 45_000
const RECORD_MS = 10 * 60_000
const MAX_ROWS = 50
const T_NUMBER = /^T?(\d{13})$/i

/** "T2011001234567" (or the bare 13 digits) → its 13 digits; anything else → null. */
export function tNumberDigits(value: string): string | null {
  return T_NUMBER.exec(value.trim())?.[1] ?? null
}

interface Snapshot {
  readonly invoices: readonly IndexedPayment[]
  readonly routed: readonly IndexedPayment[]
  readonly transfers: readonly IndexedTransfer[]
  readonly decimals: number
  readonly indexedFrom: number
}

export interface SettlementsApi {
  list(digits: string | null): Promise<SettlementsBody>
}

/** `payees`: the T-numbers whose direct transfers count, e.g. the x402 merchants (SETTLEMENT_PAYEES). */
export function createSettlements(reader: MultiBaasReader, payees: readonly string[], memo: Memo = createMemo()): SettlementsApi {
  const known = payees.flatMap((entry) => tNumberDigits(entry) ?? [])
  const record = (digits: string) => memo<Payee>(`payee:${digits}`, RECORD_MS, () => reader.payee(digits))

  const snapshot = () =>
    memo<Snapshot>('snapshot', ROWS_MS, async () => {
      const [invoices, routed, transfers, decimals, indexedFrom] = await Promise.all([
        reader.rows('meigi_invoices_paid'),
        reader.rows('meigi_router_paid'),
        reader.rows('meigi_mjpy_transfers'),
        memo('decimals', RECORD_MS, () => reader.decimals()),
        memo('indexedFrom', RECORD_MS, () => reader.indexedFrom()),
      ])
      return { invoices: invoices.map(paymentRow), routed: routed.map(paymentRow), transfers: transfers.map(transferRow), decimals, indexedFrom }
    })

  return {
    async list(digits) {
      const data = await snapshot()
      const scope = digits ? [digits] : [...new Set([...known, ...[...data.invoices, ...data.routed].map((p) => p.digits)])]
      const records = new Map(await Promise.all(scope.map(async (d) => [d, await record(d)] as const)))
      const inScope = (d: string) => records.has(d)
      const settledTxs = new Set([...data.invoices, ...data.routed].map((p) => p.txHash.toLowerCase()))
      const byPayout = new Map([...records].flatMap(([d, payee]) => (payee.payout ? [[payee.payout.toLowerCase(), d] as const] : [])))

      const row = (kind: Kind, d: string, p: { txHash: string; blockNumber: number; at: string | null; payout: string; amount: bigint }): Settlement => ({
        kind,
        txHash: p.txHash,
        blockNumber: p.blockNumber,
        at: p.at,
        tNumber: `T${d}`,
        ens: `t${d}.payee.eth`,
        legalName: records.get(d)?.legalName ?? null,
        payout: p.payout,
        amount: { units: p.amount.toString(), display: yen(p.amount, data.decimals) },
      })
      const direct = data.transfers.flatMap((t) => {
        const d = byPayout.get(t.recipient.toLowerCase())
        return d && !settledTxs.has(t.txHash.toLowerCase()) ? [row('transfer', d, { ...t, payout: t.recipient })] : []
      })
      const settlements = [
        ...data.invoices.filter((p) => inScope(p.digits)).map((p) => row('invoice', p.digits, p)),
        ...data.routed.filter((p) => inScope(p.digits)).map((p) => row('router', p.digits, p)),
        ...direct,
      ]
        .sort((a, b) => b.blockNumber - a.blockNumber || a.txHash.localeCompare(b.txHash))
        .slice(0, MAX_ROWS)
      return { indexer: 'Curvegrid MultiBaas', network: 'Sepolia', chainId: 11155111, indexedFrom: data.indexedFrom, tNumber: digits ? `T${digits}` : null, settlements }
    },
  }
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
    return json(await api.list(digits), 200, 'public, max-age=30')
  } catch (error) {
    if (!(error instanceof Upstream)) throw error
    console.error(`[settlements] ${error.message}`)
    return json({ code: 'settlements_unavailable', message: 'Settlements are unavailable right now.' }, 503, 'no-store')
  }
}

// The site's own settlements API (apps/web/worker): what Meigi's contracts settled on Sepolia, as Curvegrid
// MultiBaas indexed it. Same origin on the hosted site; in dev, Vite proxies /api to `wrangler dev` (see vite.config).

import { getAddress } from 'viem'
import { requestJson } from './http'
import { bad, hex, num, optStr, record, str, type Json } from './parse'

export type SettlementKind = 'invoice' | 'router' | 'transfer'

export interface Settlement {
  readonly kind: SettlementKind
  readonly txHash: `0x${string}`
  readonly blockNumber: number
  readonly at: Date | null
  readonly tNumber: string
  readonly ens: string
  /** Withheld (null) while the payee is disputed, as everywhere on the site. */
  readonly legalName: string | null
  readonly payout: `0x${string}`
  readonly amount: { readonly units: bigint; readonly display: string }
}

export interface Settlements {
  readonly indexer: string
  readonly network: string
  /** MultiBaas indexes from this block; older payments aren't in its index. */
  readonly indexedFrom: number
  readonly tNumber: string | null
  readonly settlements: readonly Settlement[]
}

const KINDS: readonly SettlementKind[] = ['invoice', 'router', 'transfer']
const WHAT = 'settlements answer'

function settlement(value: unknown): Settlement {
  const row = record(value, WHAT)
  const kind = str(row, 'kind', WHAT)
  if (!KINDS.includes(kind as SettlementKind)) throw bad(WHAT)
  const tNumber = str(row, 'tNumber', WHAT)
  if (!/^T\d{13}$/.test(tNumber)) throw bad(WHAT)
  const amount = record(row.amount, WHAT)
  const units = str(amount, 'units', WHAT)
  if (!/^\d{1,78}$/.test(units)) throw bad(WHAT)
  const at = optStr(row, 'at')
  const date = at ? new Date(at) : null
  let payout: `0x${string}`
  try {
    payout = getAddress(hex(row, 'payout', WHAT))
  } catch {
    throw bad(WHAT)
  }
  const txHash = hex(row, 'txHash', WHAT)
  if (txHash.length !== 66) throw bad(WHAT)
  return {
    kind: kind as SettlementKind,
    txHash,
    blockNumber: num(row, 'blockNumber', WHAT),
    at: date && !Number.isNaN(date.getTime()) ? date : null,
    tNumber,
    ens: str(row, 'ens', WHAT),
    legalName: optStr(row, 'legalName') || null,
    payout,
    amount: { units: BigInt(units), display: str(amount, 'display', WHAT) },
  }
}

export function parseSettlements(value: unknown): Settlements {
  const body: Json = record(value, WHAT)
  if (!Array.isArray(body.settlements)) throw bad(WHAT)
  return {
    indexer: str(body, 'indexer', WHAT),
    network: str(body, 'network', WHAT),
    indexedFrom: num(body, 'indexedFrom', WHAT),
    tNumber: optStr(body, 'tNumber'),
    settlements: body.settlements.map(settlement),
  }
}

/** Every settlement, or one payee's (a T-number like "T2011001234567"). */
export async function fetchSettlements(tNumber?: string, signal?: AbortSignal): Promise<Settlements> {
  const query = tNumber ? `?tNumber=${encodeURIComponent(tNumber)}` : ''
  return parseSettlements(await requestJson(`/api/settlements${query}`, { timeoutMs: 15_000, signal }))
}

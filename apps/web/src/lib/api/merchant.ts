// Client for the x402 demo (services/x402-demo): a guarded buyer agent purchases from an honest merchant or
// from the same merchant with a swapped payTo. Each call returns the guard's verdict and any settlement.

import { env } from '../env/env'
import { joinUrl, requestJson } from './http'
import { isRecord, optStr, record, type Json } from './parse'

export type MerchantKind = 'honest' | 'compromised'

export interface GuardVerdictView {
  readonly ok: boolean
  readonly code: string | null
  readonly reason: string | null
  readonly tNumber: string | null
  readonly legalName: string | null
  readonly payTo: string | null
  readonly screening: { readonly flagged: boolean; readonly summary: string } | null
}

export interface Purchase {
  readonly verdict: GuardVerdictView | null
  readonly paid: boolean
  readonly txHash: string | null
  readonly data: unknown
}

function parseVerdict(value: unknown): GuardVerdictView | null {
  if (!isRecord(value)) return null
  const screening = isRecord(value.screening)
    ? { flagged: value.screening.flagged === true, summary: optStr(value.screening, 'summary') ?? '' }
    : null
  return {
    ok: value.ok === true,
    code: optStr(value, 'code'),
    reason: optStr(value, 'reason'),
    tNumber: optStr(value, 'tNumber'),
    legalName: optStr(value, 'legalName'),
    payTo: optStr(value, 'payTo'),
    screening,
  }
}

/** x402 settlement (`PAYMENT-RESPONSE`) or a `payment` object: either carries the transaction hash. */
function txHashOf(body: Json): string | null {
  for (const key of ['settlement', 'payment']) {
    const item = body[key]
    if (!isRecord(item)) continue
    const hash = optStr(item, 'transaction') ?? optStr(item, 'txHash')
    if (hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) return hash
  }
  return null
}

export async function runPurchase(kind: MerchantKind): Promise<Purchase> {
  const body = record(await requestJson(joinUrl(env.merchantUrl, `/demo/${kind}`), { timeoutMs: 90_000 }), 'purchase')
  const txHash = txHashOf(body)
  return {
    verdict: parseVerdict(body.verdict),
    paid: body.paid === true || txHash !== null,
    txHash,
    data: body.data ?? null,
  }
}

// A read-only MultiBaas (Curvegrid) client for the settlements API. It makes exactly these requests, all built here
// from constants: three saved event queries, two contract reads (payeeOf, decimals), the vault's indexing status
// and the token alias's address. Nothing from an incoming request becomes part of a path; a T-number only travels as a validated method
// argument. The names mirror services/agent/src/multibaas/labels.ts, which the setup script creates in MultiBaas.

import type { Env } from './env'

export const QUERIES = ['meigi_invoices_paid', 'meigi_router_paid', 'meigi_mjpy_transfers'] as const
export type QueryName = (typeof QUERIES)[number]

const PATHS = {
  query: (name: QueryName) => `/queries/${name}/results?limit=50`,
  payeeOf: '/chains/ethereum/addresses/meigi_registry/contracts/meigi_payee_registry/methods/payeeOf',
  decimals: '/chains/ethereum/addresses/meigi_mjpy/contracts/meigi_jpy_token/methods/decimals',
  vaultStatus: '/chains/ethereum/addresses/meigi_vault/contracts/meigi_agent_vault/status',
  token: '/chains/ethereum/addresses/meigi_mjpy',
} as const

const TIMEOUT_MS = 8_000
const ACTIVE = 1 // IPayeeRegistry.Status: None, Active, Disputed

/** MultiBaas is unconfigured, unreachable, slow or answered unexpectedly. Its body is never passed on. */
export class Upstream extends Error {
  override readonly name = 'Upstream'
}

/** A registry record as the site shows it: a disputed payee's name and payout are withheld, as elsewhere. */
export interface Payee {
  readonly legalName: string | null
  readonly payout: string | null
}

export interface MultiBaasReader {
  rows(query: QueryName): Promise<Record<string, unknown>[]>
  payee(digits: string): Promise<Payee>
  decimals(): Promise<number>
  indexedFrom(): Promise<number>
  /** The mJPYC contract (lowercase), to check the router rows' token column. */
  tokenAddress(): Promise<string>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Only an https MultiBaas deployment URL: the key is never sent anywhere else. */
function baseUrl(configured: string | undefined): string | null {
  if (!configured) return null
  try {
    const url = new URL(configured)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.multibaas.com') || url.pathname.replace(/\/+$/, '') !== '') return null
    return `${url.origin}/api/v0`
  } catch {
    return null
  }
}

export function createReader(env: Env, fetcher: typeof fetch = fetch): MultiBaasReader {
  const base = baseUrl(env.MULTIBAAS_URL)
  const key = env.MULTIBAAS_API_KEY

  async function call(path: string, body?: unknown): Promise<unknown> {
    if (!base || !key) throw new Upstream('MultiBaas is not configured')
    let response: Response
    try {
      response = await fetcher(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        redirect: 'manual', // a redirect is an error below, so the key never follows one
        headers: {
          authorization: `Bearer ${key}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      throw new Upstream('MultiBaas could not be reached')
    }
    const envelope: unknown = await response.json().catch(() => null)
    if (!response.ok || !isRecord(envelope) || !('result' in envelope)) throw new Upstream(`MultiBaas answered ${response.status}`)
    return envelope.result
  }

  async function method(path: string, args: unknown[]): Promise<unknown> {
    const result = await call(path, { args })
    if (!isRecord(result) || !('output' in result)) throw new Upstream('MultiBaas returned a contract read in an unexpected shape')
    return result.output
  }

  return {
    async rows(query) {
      const result = await call(PATHS.query(query))
      if (!isRecord(result) || !Array.isArray(result.rows) || !result.rows.every(isRecord)) {
        throw new Upstream(`MultiBaas returned ${query} in an unexpected shape`)
      }
      // MultiBaas may return aliases in any case; the queries define them in lowercase.
      return result.rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v])))
    },
    async payee(digits) {
      const output = await method(PATHS.payeeOf, [digits])
      if (!isRecord(output) || typeof output.status !== 'number') throw new Upstream('MultiBaas returned payeeOf in an unexpected shape')
      const active = output.status === ACTIVE
      const name = typeof output.legalName === 'string' && output.legalName ? output.legalName : null
      const payout = typeof output.payout === 'string' && /^0x[0-9a-fA-F]{40}$/.test(output.payout) ? output.payout : null
      return { legalName: active ? name : null, payout: active ? payout : null }
    },
    async decimals() {
      const output = Number(await method(PATHS.decimals, []))
      if (!Number.isInteger(output) || output < 0 || output > 36) throw new Upstream('MultiBaas returned unusable token decimals')
      return output
    },
    async indexedFrom() {
      const status = await call(PATHS.vaultStatus)
      if (!isRecord(status) || typeof status.startBlockNumber !== 'number') throw new Upstream('MultiBaas returned its indexing status in an unexpected shape')
      return status.startBlockNumber
    },
    async tokenAddress() {
      const alias = await call(PATHS.token)
      if (!isRecord(alias) || typeof alias.address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(alias.address)) {
        throw new Upstream('MultiBaas returned the token alias in an unexpected shape')
      }
      return alias.address.toLowerCase()
    },
  }
}

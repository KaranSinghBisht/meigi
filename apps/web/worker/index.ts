// The meigi site's Worker. wrangler.landing.jsonc runs it first only for /api/*; every other path is a static asset
// (the app, with single-page fallback). Both APIs are read-only: GET /api/settlements, and /api/ask ("Ask the
// ledger"), which answers questions from those settlements only.

import { createAsk } from './ask'
import type { Env } from './env'
import { createReader } from './multibaas'
import { createSettlements, settlementsResponse, SNAPSHOT_EDGE_S, type SettlementsApi, type SnapshotStore } from './settlements'

let api: SettlementsApi | null = null // one per isolate, so its cache is shared by every request it serves
const ask = createAsk() // likewise, so its status cache is

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })
}

/**
 * The snapshot shared by every isolate in a data centre, through the Workers Cache API. A miss or a failure is null;
 * settlements.ts checks whatever comes back. The key names the settings it was built for, so a snapshot from another
 * configuration is never reused.
 */
function edgeStore(scope: string): SnapshotStore | undefined {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
  if (!cache) return undefined
  const key = new Request(`https://settlements.meigi.internal/snapshot/v3?scope=${encodeURIComponent(scope)}`)
  const quiet = (what: string) => (error: unknown) => {
    console.error(`[settlements] edge cache ${what} failed: ${error instanceof Error ? error.name : 'error'}`)
    return null
  }
  return {
    async get(): Promise<unknown> {
      const hit = await cache.match(key).catch(quiet('read'))
      return hit ? await hit.json().catch(quiet('parse')) : null
    },
    async put(snapshot) {
      const left = SNAPSHOT_EDGE_S - Math.floor((Date.now() - Date.parse(snapshot.asOf)) / 1000) // what's left of its window
      const body = new Response(JSON.stringify(snapshot), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${Math.max(1, Math.min(SNAPSHOT_EDGE_S, left))}` } })
      await cache.put(key, body)
    },
  }
}

/** The isolate's one API. Its settings are the deployment's vars, so they are read once. */
function settlementsApi(env: Env): SettlementsApi {
  const payees = (env.SETTLEMENT_PAYEES ?? '').split(',')
  const token = env.SETTLEMENT_TOKEN ?? null
  const x402Buyer = env.X402_BUYER ?? null
  const store = edgeStore([payees.join(','), token ?? '', x402Buyer ?? ''].join('|'))
  return createSettlements(createReader(env), { payees, token, x402Buyer, store })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (url.pathname === '/api/ask') return ask(request, env, () => (api ??= settlementsApi(env)))
    if (url.pathname !== '/api/settlements') return json({ code: 'not_found', message: 'There is no such API.' }, 404)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ code: 'method_not_allowed', message: 'Only GET is supported.' }, 405, { allow: 'GET, HEAD' })
    }
    try {
      api ??= settlementsApi(env)
      return await settlementsResponse(url, api)
    } catch (error) {
      console.error(`[settlements] unexpected ${error instanceof Error ? error.name : 'error'}`)
      return json({ code: 'internal', message: 'Something went wrong.' }, 500)
    }
  },
}

// The daily cap's Durable Object class must be exported from the Worker's entry module.
export { AskQuota } from './ask-quota'

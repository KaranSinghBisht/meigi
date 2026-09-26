// The meigi site's Worker. wrangler.landing.jsonc runs it first only for /api/*; every other path is a static asset
// (the app, with single-page fallback). The one API is read-only: GET /api/settlements.

import type { Env } from './env'
import { createReader } from './multibaas'
import { createSettlements, parseSnapshot, settlementsResponse, SNAPSHOT_EDGE_S, type SettlementsApi, type Snapshot, type SnapshotStore } from './settlements'

let api: SettlementsApi | null = null // one per isolate, so its cache is shared by every request it serves

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })
}

/**
 * The snapshot shared by every isolate in a data centre, through the Workers Cache API. A miss or a failure is null.
 * The key names the scope it was built for, so a snapshot from another configuration is never reused.
 */
function edgeStore(scope: string): SnapshotStore | undefined {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default
  if (!cache) return undefined
  const key = new Request(`https://settlements.meigi.internal/snapshot/v2?scope=${encodeURIComponent(scope)}`)
  const quiet = (what: string) => (error: unknown) => {
    console.error(`[settlements] edge cache ${what} failed: ${error instanceof Error ? error.name : 'error'}`)
    return null
  }
  return {
    async get(): Promise<Snapshot | null> {
      const hit = await cache.match(key).catch(quiet('read'))
      return hit ? parseSnapshot(await hit.json().catch(quiet('parse'))) : null
    },
    async put(snapshot) {
      const body = new Response(JSON.stringify(snapshot), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${SNAPSHOT_EDGE_S}` } })
      await cache.put(key, body)
    },
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (url.pathname !== '/api/settlements') return json({ code: 'not_found', message: 'There is no such API.' }, 404)
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ code: 'method_not_allowed', message: 'Only GET is supported.' }, 405, { allow: 'GET, HEAD' })
    }
    try {
      const payees = (env.SETTLEMENT_PAYEES ?? '').split(',')
      const x402Buyer = env.X402_BUYER ?? null
      api ??= createSettlements(createReader(env), { payees, x402Buyer, store: edgeStore(`${payees.join(',')}|${x402Buyer ?? ''}`) })
      return await settlementsResponse(url, api)
    } catch (error) {
      console.error(`[settlements] unexpected ${error instanceof Error ? error.name : 'error'}`)
      return json({ code: 'internal', message: 'Something went wrong.' }, 500)
    }
  },
}

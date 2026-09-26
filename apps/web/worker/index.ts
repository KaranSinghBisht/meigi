// The meigi site's Worker. wrangler.landing.jsonc runs it first only for /api/*; every other path is a static asset
// (the app, with single-page fallback). The one API is read-only: GET /api/settlements.

import type { Env } from './env'
import { createReader } from './multibaas'
import { createSettlements, settlementsResponse, type SettlementsApi } from './settlements'

let api: SettlementsApi | null = null // one per isolate, so its cache is shared by every request it serves

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (url.pathname !== '/api/settlements') return json({ code: 'not_found', message: 'There is no such API.' }, 404)
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ code: 'method_not_allowed', message: 'Only GET is supported.' }, 405)
    try {
      api ??= createSettlements(createReader(env), (env.SETTLEMENT_PAYEES ?? '').split(','))
      return await settlementsResponse(url, api)
    } catch (error) {
      console.error(`[settlements] unexpected ${error instanceof Error ? error.name : 'error'}`)
      return json({ code: 'internal', message: 'Something went wrong.' }, 500)
    }
  },
}

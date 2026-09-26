// "Ask the ledger": the daily caps, one small SQLite-backed Durable Object counting questions per UTC day, for everyone
// and per asker (an IPv4 address or IPv6 /64, only ever seen here as a hash salted with the day). It keeps today
// alone: a new day starts empty. A Durable Object handles one event at a time and its storage calls close the input
// gate, so read-then-write can't race: the caps are exact across every data centre.

interface QuotaStorage {
  get<T>(key: string): Promise<T | undefined>
  put(key: string, value: unknown): Promise<void>
}

export interface QuotaState {
  readonly storage: QuotaStorage
}

export interface QuotaNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> }
}

interface Day {
  readonly day: string
  readonly total: number
  readonly byAsker: Readonly<Record<string, number>>
}

export type Taken = { readonly taken: true } | { readonly taken: false; readonly reason: 'paused' | 'ip_limited' }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const ASKER = /^[0-9a-f]{16}$/
const KEY = 'today'

const count = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : null)

/** The counters. GET /peek says whether anyone may ask; POST /take counts one question; POST /refund gives it back. */
export class AskQuota {
  constructor(private readonly state: QuotaState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const day = url.searchParams.get('day') ?? ''
    const cap = count(url.searchParams.get('cap'))
    const asker = url.searchParams.get('asker') ?? ''
    if (!DAY.test(day)) return new Response(null, { status: 400 })
    const stored = await this.state.storage.get<Day>(KEY)
    const today: Day = stored?.day === day ? stored : { day, total: 0, byAsker: {} }
    if (url.pathname === '/peek' && cap !== null) return Response.json({ open: today.total < cap })
    if (request.method !== 'POST' || !ASKER.test(asker)) return new Response(null, { status: 400 })
    if (url.pathname === '/refund') return this.refund(today, asker)
    const askerCap = count(url.searchParams.get('askerCap'))
    if (url.pathname !== '/take' || cap === null || askerCap === null) return new Response(null, { status: 400 })
    return this.take(today, asker, cap, askerCap)
  }

  private async take(today: Day, asker: string, cap: number, askerCap: number): Promise<Response> {
    const asked = today.byAsker[asker] ?? 0
    if (today.total >= cap) return Response.json({ taken: false, reason: 'paused' } satisfies Taken)
    if (asked >= askerCap) return Response.json({ taken: false, reason: 'ip_limited' } satisfies Taken)
    await this.state.storage.put(KEY, {
      ...today,
      total: today.total + 1,
      byAsker: { ...today.byAsker, [asker]: asked + 1 },
    })
    return Response.json({ taken: true } satisfies Taken)
  }

  private async refund(today: Day, asker: string): Promise<Response> {
    const asked = today.byAsker[asker] ?? 0
    if (asked === 0 || today.total === 0) return Response.json({ refunded: false })
    await this.state.storage.put(KEY, {
      ...today,
      total: today.total - 1,
      byAsker: { ...today.byAsker, [asker]: asked - 1 },
    })
    return Response.json({ refunded: true })
  }
}

/** Today in UTC, as the counters' key. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** An asker as the counters see it: 16 hex characters of SHA-256 over the day and their key, never the address. */
export async function askerTag(key: string, day: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ask-the-ledger|${day}|${key}`))
  return [...new Uint8Array(digest).slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function call(quota: QuotaNamespace, path: string, params: Record<string, string | number>): Promise<unknown> {
  const stub = quota.get(quota.idFromName('ask-the-ledger'))
  const query = new URLSearchParams(Object.entries(params).map(([name, value]) => [name, String(value)]))
  const response = await stub.fetch(`https://quota${path}?${query}`, { method: path === '/peek' ? 'GET' : 'POST' })
  if (!response.ok) throw new Error(`quota answered ${response.status}`)
  return response.json()
}

const field = (body: unknown, name: string) =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined

export async function peekQuota(quota: QuotaNamespace, day: string, cap: number): Promise<boolean> {
  return field(await call(quota, '/peek', { day, cap }), 'open') === true
}

export interface Ask {
  readonly day: string
  readonly asker: string
  readonly cap: number
  readonly askerCap: number
}

export async function takeQuota(quota: QuotaNamespace, ask: Ask): Promise<Taken> {
  const body = await call(quota, '/take', { ...ask })
  if (field(body, 'taken') === true) return { taken: true }
  return { taken: false, reason: field(body, 'reason') === 'ip_limited' ? 'ip_limited' : 'paused' }
}

/** Gives a question back when it got no answer (the model failed), so a failure doesn't spend anyone's day. */
export async function refundQuota(quota: QuotaNamespace, ask: Pick<Ask, 'day' | 'asker'>): Promise<void> {
  await call(quota, '/refund', { ...ask })
}

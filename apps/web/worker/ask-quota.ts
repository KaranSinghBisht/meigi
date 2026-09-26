// "Ask the ledger": the daily caps, one small SQLite-backed Durable Object counting per UTC day the questions for
// everyone and per asker (an IPv4 address or IPv6 /64, only ever seen here as a hash salted with the day), and the
// Workers AI neurons they may spend. It keeps today alone: a new day starts empty. A Durable Object handles one event
// at a time and its storage calls close the input gate, so read-then-write can't race: the caps are exact across every
// data centre.

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
  /** Reserved at each call's worst case, and never given back: a call that failed may still have been billed. */
  readonly neurons: number
}

export type Taken = { readonly taken: true } | { readonly taken: false; readonly reason: 'paused' | 'ip_limited' }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const ASKER = /^[0-9a-f]{16}$/
const KEY = 'today'

const whole = (value: string | null) => (value !== null && /^\d+$/.test(value) ? Number(value) : null)
const counted = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0)
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/** Whether storage already holds a later day than `day` (ISO days compare as strings). */
function isLater(stored: unknown, day: string): boolean {
  return isObject(stored) && typeof stored.day === 'string' && DAY.test(stored.day) && stored.day > day
}

/** What storage holds for `day`, read field by field (an older version may have written it), else an empty day. */
function todayOf(stored: unknown, day: string): Day {
  if (!isObject(stored) || stored.day !== day) return { day, total: 0, byAsker: {}, neurons: 0 }
  const byAsker = isObject(stored.byAsker) ? stored.byAsker : {}
  return {
    day,
    total: counted(stored.total),
    byAsker: Object.fromEntries(Object.entries(byAsker).map(([asker, asked]) => [asker, counted(asked)])),
    neurons: counted(stored.neurons),
  }
}

/** A question's claim on the day: who asks, the caps, and the most its model call can cost. */
export interface Ask {
  readonly day: string
  readonly asker: string
  readonly cap: number
  readonly askerCap: number
  readonly neuronCap: number
  readonly neurons: number
}

function askIn(params: URLSearchParams): Ask | null {
  const number = (name: string) => whole(params.get(name))
  const [cap, askerCap, neuronCap, neurons] = [
    number('cap'),
    number('askerCap'),
    number('neuronCap'),
    number('neurons'),
  ]
  const day = params.get('day') ?? ''
  const asker = params.get('asker') ?? ''
  if (cap === null || askerCap === null || neuronCap === null || neurons === null || !ASKER.test(asker)) return null
  return { day, asker, cap, askerCap, neuronCap, neurons }
}

/**
 * The counters. GET /peek says whether anyone may ask; POST /take counts one question and reserves its neurons;
 * POST /refund gives the question back (not the neurons) when it got no answer.
 */
export class AskQuota {
  constructor(private readonly state: QuotaState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const day = url.searchParams.get('day') ?? ''
    if (!DAY.test(day)) return new Response(null, { status: 400 })
    const stored = await this.state.storage.get<unknown>(KEY)
    if (isLater(stored, day)) return this.late(url.pathname)
    const today = todayOf(stored, day)
    if (url.pathname === '/peek') return this.peek(today, url.searchParams)
    if (request.method !== 'POST') return new Response(null, { status: 400 })
    if (url.pathname === '/refund') return this.refund(today, url.searchParams.get('asker') ?? '')
    const ask = url.pathname === '/take' ? askIn(url.searchParams) : null
    return ask ? this.take(today, ask) : new Response(null, { status: 400 })
  }

  /**
   * A request from a day that has ended, landing after the next day began (it started before 00:00 UTC). Writing it
   * would put yesterday's counters over today's, so nothing is written: no question is taken or given back.
   */
  private late(path: string): Response {
    if (path === '/refund') return Response.json({ refunded: false })
    if (path === '/peek') return Response.json({ open: false })
    return Response.json({ taken: false, reason: 'paused' } satisfies Taken)
  }

  private peek(today: Day, params: URLSearchParams): Response {
    const cap = whole(params.get('cap'))
    const neuronCap = whole(params.get('neuronCap'))
    if (cap === null || neuronCap === null) return new Response(null, { status: 400 })
    return Response.json({ open: today.total < cap && today.neurons < neuronCap })
  }

  private async take(today: Day, ask: Ask): Promise<Response> {
    const asked = today.byAsker[ask.asker] ?? 0
    if (today.total >= ask.cap || today.neurons + ask.neurons > ask.neuronCap) {
      return Response.json({ taken: false, reason: 'paused' } satisfies Taken)
    }
    if (asked >= ask.askerCap) return Response.json({ taken: false, reason: 'ip_limited' } satisfies Taken)
    await this.state.storage.put(KEY, {
      ...today,
      total: today.total + 1,
      byAsker: { ...today.byAsker, [ask.asker]: asked + 1 },
      neurons: today.neurons + ask.neurons,
    } satisfies Day)
    return Response.json({ taken: true } satisfies Taken)
  }

  private async refund(today: Day, asker: string): Promise<Response> {
    if (!ASKER.test(asker)) return new Response(null, { status: 400 })
    const asked = today.byAsker[asker] ?? 0
    if (asked === 0 || today.total === 0) return Response.json({ refunded: false })
    await this.state.storage.put(KEY, {
      ...today,
      total: today.total - 1,
      byAsker: { ...today.byAsker, [asker]: asked - 1 },
    } satisfies Day)
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

export async function peekQuota(
  quota: QuotaNamespace,
  limits: Pick<Ask, 'day' | 'cap' | 'neuronCap'>,
): Promise<boolean> {
  return field(await call(quota, '/peek', { ...limits }), 'open') === true
}

export async function takeQuota(quota: QuotaNamespace, ask: Ask): Promise<Taken> {
  const body = await call(quota, '/take', { ...ask })
  if (field(body, 'taken') === true) return { taken: true }
  return { taken: false, reason: field(body, 'reason') === 'ip_limited' ? 'ip_limited' : 'paused' }
}

/** Gives a question back when it got no answer, so a failure doesn't spend anyone's day. Its neurons stay spent. */
export async function refundQuota(quota: QuotaNamespace, ask: Pick<Ask, 'day' | 'asker'>): Promise<void> {
  await call(quota, '/refund', { ...ask })
}

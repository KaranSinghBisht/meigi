// "Ask the ledger": the global daily cap, one small SQLite-backed Durable Object counting questions per UTC day. A
// Durable Object handles one event at a time and its storage calls close the input gate, so read-then-write can't
// race: the cap is exact across every data centre.

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

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** The counter. GET /peek?day=&cap= says whether a question may be asked; POST /take counts one if it may. */
export class AskQuota {
  constructor(private readonly state: QuotaState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const day = url.searchParams.get('day') ?? ''
    const cap = Number(url.searchParams.get('cap'))
    if (!DAY.test(day) || !Number.isInteger(cap) || cap < 0) return new Response(null, { status: 400 })
    const key = `asked:${day}`
    const used = (await this.state.storage.get<number>(key)) ?? 0
    if (url.pathname === '/take' && request.method === 'POST') {
      if (used >= cap) return Response.json({ open: false })
      await this.state.storage.put(key, used + 1)
      return Response.json({ open: true })
    }
    return Response.json({ open: used < cap })
  }
}

/** Today in UTC, as the counter's key. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

async function ask(quota: QuotaNamespace, path: '/peek' | '/take', day: string, cap: number): Promise<boolean> {
  const stub = quota.get(quota.idFromName('ask-the-ledger'))
  const response = await stub.fetch(`https://quota${path}?day=${day}&cap=${cap}`, {
    method: path === '/take' ? 'POST' : 'GET',
  })
  if (!response.ok) throw new Error(`quota answered ${response.status}`)
  const body: unknown = await response.json()
  return typeof body === 'object' && body !== null && (body as { open?: unknown }).open === true
}

export const peekQuota = (quota: QuotaNamespace, day: string, cap: number) => ask(quota, '/peek', day, cap)
export const takeQuota = (quota: QuotaNamespace, day: string, cap: number) => ask(quota, '/take', day, cap)

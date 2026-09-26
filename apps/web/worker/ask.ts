// "Ask the ledger": POST /api/ask { question } answers a question about the settlements GET /api/settlements serves,
// as { answer, citedTx, suggestions }. The model only reads the question into a fixed query; the Worker computes the
// answer from the rows and writes it from templates, so nothing the model says is ever shown. GET /api/ask says
// whether it is on and whether questions are open today. Read-only, no tools. Off unless ASK_ENABLED is "true".
//
// Nothing is counted until a question passes every check (ask-request.ts). Then: 3 a minute per asker (the rate-limit
// binding), and per UTC day 5 per asker and 30 for everyone (a Durable Object; ASK_IP_DAILY_CAP and ASK_DAILY_CAP).
// A question the model fails to read is given back. Errors are generic; nothing a visitor typed is logged.

import { answerFor, refusal, type Answer } from './ask-answer'
import { payeesOf, queryOf } from './ask-intent'
import { MAX_QUESTION, MODEL, modelInput, modelReply } from './ask-prompt'
import { askerTag, peekQuota, refundQuota, takeQuota, utcDay, type Ask, type QuotaNamespace } from './ask-quota'
import { clientKey, isJson, questionIn, readCapped, sameOrigin } from './ask-request'
import { jstDay } from './ask-scope'
import type { AiBinding, Env, RateLimiter } from './env'
import type { Settlement, SettlementsApi } from './settlements'

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
}
const MODEL_TIMEOUT_MS = 15_000
const STATUS_TTL_MS = 10_000
const DEFAULT_CAP = 30
const DEFAULT_ASKER_CAP = 5

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS })
const refuse = (status: number, code: string, message: string) => reply({ code, message }, status)
const unavailable = () => refuse(503, 'unavailable', "The ledger can't answer right now.")
const paused = () => refuse(429, 'paused', 'Questions are paused until tomorrow (UTC).')
const askerPaused = () => refuse(429, 'ip_limited', 'Questions from your network are paused until tomorrow (UTC).')
const invalid = () => refuse(400, 'invalid_question', `Ask a question of up to ${MAX_QUESTION} characters.`)
const NO_SETTLEMENTS = { answer: 'There are no settlements yet.', citedTx: [], suggestions: [] }

/** A whole number from 0, or the default when the setting is missing or malformed. */
function setting(value: string | undefined, fallback: number): number {
  const number = Number(value ?? fallback)
  return Number.isInteger(number) && number >= 0 ? number : fallback
}

/** Off unless ASK_ENABLED is "true": then the panel shows no box at all, and a direct request finds no API. */
const enabled = (env: Env) => env.ASK_ENABLED === 'true'

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('model timeout')), ms))])
}

/**
 * Workers AI's daily free allocation is the account's, shared with the AP agent's own LLM calls. Once it is spent
 * (error 4006) questions are paused the same way as at our own cap: both reset at 00:00 UTC.
 */
function allocationSpent(error: unknown): boolean {
  return error instanceof Error && /\b4006\b|daily free allocation/i.test(error.message)
}

/** The question, or why the request can't be one. Checked before anything is counted. */
async function checked(request: Request): Promise<Response | string> {
  if (!sameOrigin(request)) return refuse(403, 'forbidden', 'Ask from the Meigi site.')
  if (!isJson(request)) return refuse(415, 'unsupported_media_type', 'Send the question as JSON.')
  const text = await readCapped(request)
  if (text === null) return refuse(413, 'too_large', `Ask a question of up to ${MAX_QUESTION} characters.`)
  return questionIn(text) ?? invalid()
}

/** One model call reads the question into a query; the answer is computed from the rows. */
async function answered(ai: AiBinding, rows: readonly Settlement[], question: string, now: number): Promise<Answer> {
  const payees = payeesOf(rows)
  const raw = await withTimeout(ai.run(MODEL, modelInput(payees, question, jstDay(now))), MODEL_TIMEOUT_MS)
  const query = queryOf(modelReply(raw), payees)
  return query ? answerFor(query, rows) : refusal()
}

interface Bound {
  readonly ai: AiBinding
  readonly limiter: RateLimiter
  readonly quota: QuotaNamespace
}

async function ask(request: Request, env: Env, bound: Bound, api: SettlementsApi, now: number): Promise<Response> {
  const question = await checked(request)
  if (typeof question !== 'string') return question
  const key = clientKey(request)
  if (!(await bound.limiter.limit({ key })).success) {
    return refuse(429, 'rate_limited', 'Three questions a minute: try again shortly.')
  }
  const body = await api.list(null)
  if (body.settlements.length === 0) return reply(NO_SETTLEMENTS) // nothing to ask about, so nothing is counted
  const day = utcDay(now)
  const counted: Ask = {
    day,
    asker: await askerTag(key, day),
    cap: setting(env.ASK_DAILY_CAP, DEFAULT_CAP),
    askerCap: setting(env.ASK_IP_DAILY_CAP, DEFAULT_ASKER_CAP),
  }
  const taken = await takeQuota(bound.quota, counted)
  if (!taken.taken) return taken.reason === 'paused' ? paused() : askerPaused()
  try {
    return reply({ ...(await answered(bound.ai, body.settlements, question, now)), asOf: body.asOf })
  } catch (error) {
    await refundQuota(bound.quota, counted) // no answer, so the question doesn't count
    if (allocationSpent(error)) return paused()
    throw error
  }
}

/** Whether questions are open today, asked of the Durable Object at most once per STATUS_TTL_MS per isolate. */
function statusCache() {
  let cached: { readonly key: string; readonly open: boolean; readonly until: number } | null = null
  return async (quota: QuotaNamespace, day: string, cap: number, now: number): Promise<boolean> => {
    const key = `${day}|${cap}`
    if (cached?.key === key && now < cached.until) return cached.open
    const open = await peekQuota(quota, day, cap)
    cached = { key, open, until: now + STATUS_TTL_MS }
    return open
  }
}

/** The /api/ask handler, with its own status cache: index.ts makes one per isolate. */
export function createAsk() {
  const openToday = statusCache()
  return async function askResponse(
    request: Request,
    env: Env,
    api: () => SettlementsApi,
    now = Date.now(),
  ): Promise<Response> {
    try {
      const read = request.method === 'GET' || request.method === 'HEAD'
      if (!enabled(env)) {
        return read ? reply({ enabled: false, open: false }) : refuse(404, 'not_found', 'There is no such API.')
      }
      const { AI: ai, ASK_LIMITER: limiter, ASK_QUOTA: quota } = env
      if (read) {
        const cap = setting(env.ASK_DAILY_CAP, DEFAULT_CAP)
        return reply({ enabled: true, open: ai && quota ? await openToday(quota, utcDay(now), cap, now) : false })
      }
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ code: 'method_not_allowed', message: 'Use GET or POST.' }), {
          status: 405,
          headers: { ...HEADERS, allow: 'GET, HEAD, POST' },
        })
      }
      if (!ai || !limiter || !quota) return unavailable()
      return await ask(request, env, { ai, limiter, quota }, api(), now)
    } catch (error) {
      console.error(`[ask] ${error instanceof Error ? error.name : 'error'}`)
      return unavailable()
    }
  }
}

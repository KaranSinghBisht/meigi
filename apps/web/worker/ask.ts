// "Ask the ledger": POST /api/ask { question } answers a question about the settlements GET /api/settlements serves,
// from those rows only, as { answer, citedTx }. GET /api/ask says whether it is on and whether questions are open
// today. Read-only, no tools. Off unless ASK_ENABLED is "true". Limits: 300 characters, 3 a minute per IP (the
// rate-limit binding) and a daily cap for everyone (a Durable Object, 30 unless ASK_DAILY_CAP says otherwise).
// Errors are generic; nothing a visitor typed is logged.

import { allowedIn, factsOf } from './ask-facts'
import { guardAnswer } from './ask-guard'
import { MAX_QUESTION, MODEL, modelInput, modelReply } from './ask-prompt'
import { peekQuota, takeQuota, utcDay } from './ask-quota'
import type { Env } from './env'
import type { SettlementsApi } from './settlements'

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
}
const MAX_BODY = 2048
const MODEL_TIMEOUT_MS = 25_000
const DEFAULT_CAP = 30

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: HEADERS })
const refuse = (status: number, code: string, message: string) => reply({ code, message }, status)
const unavailable = () => refuse(503, 'unavailable', "The ledger can't answer right now.")

function dailyCap(env: Env): number {
  const cap = Number(env.ASK_DAILY_CAP ?? DEFAULT_CAP)
  return Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_CAP
}

/** The question from a small JSON body: 1 to 300 characters of text, or null. */
async function questionOf(request: Request): Promise<string | null> {
  const text = await request.text()
  if (text.length > MAX_BODY) return null
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  const question = typeof body === 'object' && body !== null ? (body as { question?: unknown }).question : null
  if (typeof question !== 'string') return null
  const trimmed = question.trim()
  return trimmed.length > 0 && [...trimmed].length <= MAX_QUESTION ? trimmed : null
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('model timeout')), ms))])
}

const paused = () => refuse(429, 'paused', 'Questions are paused until tomorrow (UTC).')

/**
 * Workers AI's daily free allocation is the account's, shared with the AP agent's own LLM calls. Once it is spent
 * (error 4006) questions are paused the same way as at our own cap: both reset at 00:00 UTC.
 */
function allocationSpent(error: unknown): boolean {
  return error instanceof Error && /\b4006\b|daily free allocation/i.test(error.message)
}

/** The rows, the facts worked out from them, one model call, and the guard over what it said. */
async function answer(env: Env, api: SettlementsApi, question: string): Promise<Response> {
  const body = await api.list(null)
  const facts = factsOf(body)
  const allowed = allowedIn(facts, body.settlements)
  const ai = env.AI
  if (!ai) return unavailable()
  let raw: unknown
  try {
    raw = await withTimeout(ai.run(MODEL, modelInput(facts, body.settlements, question)), MODEL_TIMEOUT_MS)
  } catch (error) {
    if (allocationSpent(error)) return paused()
    throw error
  }
  return reply({ ...guardAnswer(modelReply(raw), allowed), asOf: body.asOf })
}

async function ask(request: Request, env: Env, api: SettlementsApi, now: number): Promise<Response> {
  const question = await questionOf(request)
  if (!question) return refuse(400, 'invalid_question', `Ask a question of up to ${MAX_QUESTION} characters.`)
  const limiter = env.ASK_LIMITER
  const quota = env.ASK_QUOTA
  if (!limiter || !quota) return unavailable()
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  if (!(await limiter.limit({ key: ip })).success)
    return refuse(429, 'rate_limited', 'Three questions a minute: try again shortly.')
  if (!(await takeQuota(quota, utcDay(now), dailyCap(env)))) return paused()
  return answer(env, api, question)
}

/** Off unless ASK_ENABLED is "true": then the panel shows no box at all, and a direct request finds no API. */
const enabled = (env: Env) => env.ASK_ENABLED === 'true'

/** GET /api/ask (is it on, and are questions open today?) and POST /api/ask (a question). */
export async function askResponse(
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
    if (read) {
      const open = env.AI && env.ASK_QUOTA ? await peekQuota(env.ASK_QUOTA, utcDay(now), dailyCap(env)) : false
      return reply({ enabled: true, open })
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ code: 'method_not_allowed', message: 'Use GET or POST.' }), {
        status: 405,
        headers: { ...HEADERS, allow: 'GET, HEAD, POST' },
      })
    }
    return await ask(request, env, api(), now)
  } catch (error) {
    console.error(`[ask] ${error instanceof Error ? error.name : 'error'}`)
    return unavailable()
  }
}

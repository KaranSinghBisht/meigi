// "Ask the ledger": the site Worker's POST /api/ask answers a question from the settlements it serves, and GET
// /api/ask says whether it is on and whether questions are open today. Same origin on the hosted site; in dev, Vite
// proxies /api.

import { ApiError, requestJson } from './http'
import { isRecord } from './parse'

export const MAX_QUESTION = 300

export interface LedgerAnswer {
  /** Written by the Worker from the rows, never by the model. */
  readonly answer: string
  /** Transactions the answer relies on, each one of the settlement rows. */
  readonly citedTx: readonly `0x${string}`[]
  /** With the refusal: questions it can answer. */
  readonly suggestions: readonly string[]
}

/**
 * Why a question got no answer: the daily cap for everyone or for this network, the per-minute limit, a question it
 * won't take, or anything else.
 */
export type AskFailure = 'paused' | 'ip_limited' | 'rate_limited' | 'invalid_question' | 'unavailable'
/** The failures that close the box for the rest of the day. */
export type AskClosed = Extract<AskFailure, 'paused' | 'ip_limited'>

const HASH = /^0x[0-9a-fA-F]{64}$/

export function askFailure(error: unknown): AskFailure {
  if (error instanceof ApiError && ['paused', 'ip_limited', 'rate_limited', 'invalid_question'].includes(error.code)) {
    return error.code as AskFailure
  }
  return error instanceof ApiError && error.code === 'too_large' ? 'invalid_question' : 'unavailable'
}

export async function askLedger(question: string, signal?: AbortSignal): Promise<LedgerAnswer> {
  const body = await requestJson('/api/ask', { method: 'POST', body: { question }, timeoutMs: 40_000, signal })
  if (!isRecord(body) || typeof body.answer !== 'string') throw new ApiError(502, 'bad_response', 'Unreadable answer.')
  const cited = Array.isArray(body.citedTx) ? body.citedTx : []
  const suggestions = Array.isArray(body.suggestions) ? body.suggestions : []
  return {
    answer: body.answer,
    citedTx: cited.filter((tx): tx is `0x${string}` => typeof tx === 'string' && HASH.test(tx)),
    suggestions: suggestions.filter((text): text is string => typeof text === 'string'),
  }
}

export interface AskStatus {
  /** The feature is switched on (ASK_ENABLED). Off, the panel shows no box at all. */
  readonly enabled: boolean
  /** Questions are open today (under the daily cap). */
  readonly open: boolean
}

export async function askStatus(signal?: AbortSignal): Promise<AskStatus> {
  const body = await requestJson('/api/ask', { timeoutMs: 10_000, signal })
  return { enabled: isRecord(body) && body.enabled === true, open: isRecord(body) && body.open === true }
}

// Human approval of a held payment (World ID for Agents, docs/world-agents-spec.md). The agent starts an OIDC
// device grant and polls the IdP itself; the console only shows the code and link, and asks where it stands.
// Nothing here moves money: after an approval, the console pays through the usual pay route with its id.

import { env } from '../env/env'
import { authHeaders } from './agentAuth'
import { isLoopbackUrl } from './health'
import { joinUrl, requestJson } from './http'
import { bad, optStr, record, str, type Json } from './parse'

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'unavailable' | 'wrong_human'
export type Approver = 'enrolled' | 'matched'

export interface ApprovalAttempt {
  readonly attemptId: string
  readonly userCode: string
  /** Where the human approves: https, or http on this machine for a local mock IdP. */
  readonly verificationUri: string
  readonly expiresAt: Date
  readonly intervalMs: number
}

export interface ApprovalState {
  readonly attemptId: string | null
  readonly status: ApprovalStatus
  /** When the human proved (the ID token's auth_time), for "fresh World ID proof at 05:42". */
  readonly approvedAt: Date | null
  readonly approver: Approver | null
  /** The approval was already spent on a pay attempt; it pays once. */
  readonly used: boolean
  /** The agent's own sentence about the outcome, e.g. "the approval was not used in time"; safe to show. */
  readonly reason: string | null
}

const STATUSES: readonly ApprovalStatus[] = ['pending', 'approved', 'denied', 'expired', 'unavailable', 'wrong_human']
const MIN_INTERVAL_S = 1
const MAX_INTERVAL_S = 30
const DEFAULT_INTERVAL_S = 5

const url = (id: string) => joinUrl(env.agentUrl, `/invoices/${encodeURIComponent(id)}/approval`)

/** Epoch seconds (like the agent's other times) or an ISO string. */
function time(value: unknown): Date | null {
  const date = typeof value === 'number' ? new Date(value * 1000) : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : null
}

/** https, or plain http on this machine only (a local mock IdP); anything else is refused. */
function approvalLink(body: Json): string {
  const value = str(body, 'verificationUriComplete', 'approval request')
  try {
    const { protocol } = new URL(value)
    if (protocol === 'https:' || (protocol === 'http:' && isLoopbackUrl(value))) return value
  } catch {
    // falls through: not a URL at all
  }
  throw bad('approval link')
}

function interval(value: unknown): number {
  const seconds = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_INTERVAL_S
  return Math.min(MAX_INTERVAL_S, Math.max(MIN_INTERVAL_S, seconds)) * 1000
}

function parseAttempt(body: Json): ApprovalAttempt {
  const expiresAt = time(body.expiresAt)
  if (!expiresAt) throw bad('approval request')
  return {
    attemptId: str(body, 'attemptId', 'approval request'),
    userCode: str(body, 'userCode', 'approval request'),
    verificationUri: approvalLink(body),
    expiresAt,
    intervalMs: interval(body.interval),
  }
}

/** An unknown status is never read as approved. */
function parseState(body: Json): ApprovalState {
  const status = STATUSES.find((known) => known === body.status) ?? 'unavailable'
  const approver = body.approver === 'enrolled' || body.approver === 'matched' ? body.approver : null
  return {
    attemptId: optStr(body, 'attemptId'),
    status,
    approvedAt: time(body.approvedAt),
    approver,
    used: body.used === true,
    reason: optStr(body, 'reason'),
  }
}

/** Starts an approval for a held invoice: 409 unless every hold is one a human may approve. */
export async function startApproval(invoiceId: string): Promise<ApprovalAttempt> {
  const body = await requestJson(url(invoiceId), { method: 'POST', body: {}, headers: authHeaders() })
  return parseAttempt(record(body, 'approval request'))
}

export async function readApproval(invoiceId: string, signal?: AbortSignal): Promise<ApprovalState> {
  const body = await requestJson(url(invoiceId), { headers: authHeaders(), timeoutMs: 10_000, signal })
  return parseState(record(body, 'approval status'))
}

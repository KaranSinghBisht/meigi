// Typed client for the Meigi verifier (services/verifier): NTA exact match, domain proof, World ID officer
// sessions, submission, and approval intents for company changes.

import { env, type HexAddress } from '../env/env'
import { joinUrl, requestJson } from './http'
import { bad, bigintStr, hex, isRecord, num, optStr, record, str, type Json } from './parse'

const url = (path: string) => joinUrl(env.verifierUrl, path)

/** What the verifier signs for IDKit (`/world/rp-context`, and inside an intent). */
export interface RpContextWire {
  readonly rp_id?: string
  readonly sig?: string
  readonly signature?: string
  readonly nonce: string
  readonly created_at: number
  readonly expires_at: number
}

function parseRpContext(value: unknown): RpContextWire {
  const body = record(value, 'World ID request context')
  return {
    rp_id: optStr(body, 'rp_id') ?? undefined,
    sig: optStr(body, 'sig') ?? undefined,
    signature: optStr(body, 'signature') ?? undefined,
    nonce: str(body, 'nonce', 'World ID request context'),
    created_at: num(body, 'created_at', 'World ID request context'),
    expires_at: num(body, 'expires_at', 'World ID request context'),
  }
}

export async function fetchRpContext(): Promise<RpContextWire> {
  return parseRpContext(await requestJson(url('/world/rp-context')))
}

export interface NtaRecord {
  readonly tNumber: string
  readonly name: string
  readonly address: string
  readonly closed: boolean
}

/** The public NTA record for a T-number, or null when the NTA data has no such corporation. */
export async function fetchNta(tNumber: string, signal?: AbortSignal): Promise<NtaRecord | null> {
  const body = record(await requestJson(url(`/nta/${encodeURIComponent(tNumber)}`), { signal }), 'NTA record')
  const corporation = body.corporation
  if (!isRecord(corporation)) return null
  return {
    tNumber: str(body, 'tNumber', 'NTA record'),
    name: str(corporation, 'name', 'NTA record'),
    address: optStr(corporation, 'address') ?? '',
    closed: corporation.closed === true,
  }
}

export interface RegistrationInput {
  readonly tNumber: string
  readonly legalName: string
  readonly domain: string
  readonly controller: HexAddress
  readonly payout: HexAddress
}

export interface DomainProofChallenge {
  readonly message: string
  readonly txtName: string
  readonly txtValuePrefix: string
  readonly wellKnownUrl: string
}

export interface Registration {
  readonly id: string
  readonly legalName: string
  readonly domainProof: DomainProofChallenge
  readonly enrollmentSignal: string
}

export async function createRegistration(input: RegistrationInput): Promise<Registration> {
  const body = record(await requestJson(url('/registrations'), { method: 'POST', body: input }), 'registration')
  const proof = record(body.domainProof, 'domain proof challenge')
  const what = 'registration'
  return {
    id: str(body, 'id', what),
    legalName: str(body, 'legalName', what),
    domainProof: {
      message: str(proof, 'message', what),
      txtName: str(proof, 'txtName', what),
      txtValuePrefix: str(proof, 'txtValuePrefix', what),
      wellKnownUrl: str(proof, 'wellKnownUrl', what),
    },
    enrollmentSignal: str(body, 'enrollmentSignal', what),
  }
}

export async function checkDomainProof(id: string): Promise<{ readonly method: string }> {
  const body = record(
    await requestJson(url(`/registrations/${encodeURIComponent(id)}/domain`), { method: 'POST' }),
    'domain check',
  )
  return { method: str(body, 'method', 'domain check') }
}

export async function enrollOfficer(id: string, result: unknown): Promise<{ officerId: string; officers: number }> {
  const response = await requestJson(url(`/registrations/${encodeURIComponent(id)}/officers`), {
    method: 'POST',
    body: { result },
  })
  const body = record(response, 'officer enrollment')
  return {
    officerId: str(body, 'officerId', 'officer enrollment'),
    officers: num(body, 'officers', 'officer enrollment'),
  }
}

export interface Submission {
  readonly outcome: 'registered' | 'disputed'
  readonly txHash: `0x${string}`
  readonly tNumber: string
}

export async function submitRegistration(id: string, threshold: number): Promise<Submission> {
  const response = await requestJson(url(`/registrations/${encodeURIComponent(id)}/submit`), {
    method: 'POST',
    body: { threshold },
  })
  const body = record(response, 'submission')
  const outcome = str(body, 'outcome', 'submission')
  return {
    outcome: outcome === 'disputed' ? 'disputed' : 'registered',
    txHash: hex(body, 'txHash', 'submission'),
    tNumber: str(body, 'tNumber', 'submission'),
  }
}

export type IntentAction = 'PayoutChange' | 'ControllerRotation' | 'CancelPayoutChange' | 'CancelRotation'

export interface OfficerSession {
  readonly officerId: string
  readonly sessionId: string
}

export interface Intent {
  readonly intentId: string
  readonly signal: string
  readonly threshold: number
  readonly deadline: number
  readonly sessions: readonly OfficerSession[]
  readonly rpContext: RpContextWire
}

function parseSessions(value: unknown): OfficerSession[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).map((item: Json) => ({
    officerId: str(item, 'officerId', 'officer session'),
    sessionId: str(item, 'sessionId', 'officer session'),
  }))
}

export async function openIntent(input: {
  tNumber: string
  action: IntentAction
  newAddress?: HexAddress
}): Promise<Intent> {
  const body = record(await requestJson(url('/intents'), { method: 'POST', body: input }), 'approval request')
  const what = 'approval request'
  return {
    intentId: str(body, 'intentId', what),
    signal: str(body, 'signal', what),
    threshold: num(body, 'threshold', what),
    deadline: num(body, 'deadline', what),
    sessions: parseSessions(body.sessions),
    rpContext: parseRpContext(body.rpContext),
  }
}

export interface SignedApprovalWire {
  readonly officerIds: readonly `0x${string}`[]
  readonly deadline: bigint
  readonly signature: `0x${string}`
}

export type ApproveOutcome =
  | { readonly status: 'pending'; readonly approvals: number; readonly threshold: number }
  | { readonly status: 'approved'; readonly approval: SignedApprovalWire; readonly payload: string | null }
  | { readonly status: 'executed'; readonly txHash: `0x${string}` }

function parseApproval(value: unknown): SignedApprovalWire {
  const body = record(value, 'approval')
  const ids = Array.isArray(body.officerIds) ? body.officerIds : []
  if (!ids.every((id) => typeof id === 'string' && /^0x[0-9a-fA-F]{64}$/.test(id))) throw bad('approval')
  return {
    officerIds: ids as `0x${string}`[],
    deadline: bigintStr(body, 'deadline', 'approval'),
    signature: hex(body, 'signature', 'approval'),
  }
}

export async function approveIntent(intentId: string, result: unknown): Promise<ApproveOutcome> {
  const response = await requestJson(url(`/intents/${encodeURIComponent(intentId)}/approve`), {
    method: 'POST',
    body: { result },
  })
  const body = record(response, 'approval')
  const status = str(body, 'status', 'approval')
  if (status === 'pending') {
    return { status, approvals: num(body, 'approvals', 'approval'), threshold: num(body, 'threshold', 'approval') }
  }
  if (status === 'approved') return { status, approval: parseApproval(body.approval), payload: optStr(body, 'payload') }
  return { status: 'executed', txHash: hex(body, 'txHash', 'approval') }
}

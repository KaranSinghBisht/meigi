// Kind, specific wording for every error code the services send. Server messages are only shown for codes
// we don't know, and only because the services promise those messages are safe to display.

import { describeChainError } from '../chain/errors'
import { env } from '../env/env'
import { ApiError } from './http'
import { SERVICES, type Service } from './services'

export type { Service } from './services'

export type Tone = 'denied' | 'offline' | 'error'

export interface Explained {
  readonly tone: Tone
  readonly title: string
  readonly detail?: string
  /** The service's error code, for screens that react to a specific one. */
  readonly code?: string
}

const CODES: Record<string, Omit<Explained, 'tone'> & { tone?: Tone }> = {
  not_an_officer: {
    tone: 'denied',
    title: 'Denied: this is not the same human who enrolled.',
    detail: 'Only the World ID sessions enrolled as officers of this company can approve its changes.',
  },
  nta_not_found: {
    title: 'No corporation with this number in the NTA data.',
    detail: 'Sole proprietors go to manual review.',
  },
  nta_closed: { title: 'The NTA lists this corporation as closed.' },
  nta_name_mismatch: {
    title: "The name doesn't exactly match the NTA-registered name.",
    detail: 'Fuzzy matches are never accepted, so a look-alike name cannot claim a company.',
  },
  invalid_t_number: { title: 'That is not a T-number.', detail: 'Use "T" followed by 13 digits.' },
  invalid_domain: { title: 'Enter a public domain name, like example.co.jp.' },
  domain_no_proof_found: {
    title: 'No proof found yet.',
    detail: 'Publish the TXT record (or the .well-known file) and try again. DNS can take a few minutes.',
  },
  domain_signature_mismatch: {
    title: "A proof was found, but the controller wallet didn't sign it.",
    detail: 'Sign again with the controller wallet and publish the new value.',
  },
  proof_replayed: { title: 'This World ID proof was already used.', detail: 'Verify again to make a fresh proof.' },
  already_submitted: { title: 'This registration was already submitted.' },
  domain_not_verified: { title: 'Verify the domain first.' },
  no_officers: { title: 'Enroll at least one officer first.' },
  invalid_threshold: { title: 'The threshold cannot exceed the number of officers.' },
  already_registered: { title: 'This business already controls this payee.' },
  registration_not_found: { title: 'The verifier no longer knows this registration.', detail: 'Start again.' },
  payee_not_active: { title: 'This payee is not active.', detail: 'It is unregistered, or disputed and frozen.' },
  missing_new_address: { title: 'Enter the new address.' },
  intent_not_found: { title: 'This approval request no longer exists.', detail: 'Open a new one.' },
  intent_expired: { title: 'This approval request expired.', detail: 'Requests last 15 minutes. Open a new one.' },
  intent_stale: {
    title: 'The payee changed since this request was opened.',
    detail: 'Open a new request so the officers approve the current state.',
  },
  world_signal_mismatch: {
    tone: 'denied',
    title: 'This proof was made for a different request.',
    detail: 'Each approval is bound to exactly one change.',
  },
  world_not_a_session: { title: 'That proof is not a World ID session proof.' },
  world_environment_mismatch: { title: 'That proof came from a different World ID environment.' },
  unauthorized: {
    title: 'This agent asks for its operator token.',
    detail: 'It was started with AGENT_API_TOKEN. Enter the token to continue.',
  },
  payment_in_progress: { title: 'This invoice is already being paid.' },
  internal_error: { title: 'The service hit an internal error.', detail: 'Its log has the details. Try again.' },
  analysis_not_found: { title: 'The agent no longer has this analysis.', detail: 'Analyze the document again.' },
  not_approvable: {
    title: "A person can't release these holds.",
    detail:
      'Only a hold for urgency, pressure or triage can be approved; a problem with the document itself never can.',
  },
  approval_not_configured: {
    title: "Human approval isn't set up on this agent.",
    detail: 'It needs a World ID for Agents client (`WORLD_AGENTS_CLIENT_ID` and its secret).',
  },
  approval_unavailable: {
    title: "World ID can't be reached right now.",
    detail: 'Nothing was paid. Try again shortly.',
  },
  approval_not_found: { title: 'The agent has no approval request for this invoice.', detail: 'Ask again.' },
  invalid_lei: {
    title: "That LEI's check digits don't match.",
    detail: 'An LEI is 20 characters; the last two check the rest.',
  },
  lei_not_found: { title: 'GLEIF has no record of this LEI.' },
  lei_unavailable: { title: "GLEIF isn't answering right now.", detail: 'Try again in a moment.' },
  approval_busy: { title: 'Too many approvals are waiting right now.', detail: 'Try again in a minute.' },
  approval_too_soon: { title: 'An approval for this invoice was just started.', detail: 'Try again in a few seconds.' },
  approval_not_approved: {
    tone: 'denied',
    title: 'Not approved: nothing was paid.',
    detail: 'The approval is no longer valid; it must be used within 10 minutes. Ask again.',
  },
  approval_used: {
    tone: 'denied',
    title: 'This approval was already used: it pays once.',
    detail: 'Nothing more was paid.',
  },
  approval_void: {
    tone: 'denied',
    title: 'The invoice changed after it was approved, so the approval no longer counts.',
    detail: 'Nothing was paid. Ask again.',
  },
}

/**
 * Browsers report "not running" and "CORS refused this origin" the same way, so the local hint covers both. The
 * public site names no commands: there the live service runs on our own machine, because it holds keys.
 */
export function unavailable(service: Service): Explained {
  const info = SERVICES[service]
  if (env.hosted) {
    return {
      tone: 'offline',
      title: `The ${info.name} isn't reachable right now.`,
      detail: 'It runs on our own machine, because it holds keys.',
    }
  }
  return {
    tone: 'offline',
    title: `The ${info.name} isn't reachable at ${info.url}.`,
    detail: `Start it with \`${info.start}\`. If it is running, add \`${window.location.origin}\` to its APP_ORIGINS.`,
  }
}

export function explainError(error: unknown, service: Service): Explained {
  if (error instanceof ApiError) {
    if (error.unavailable) return unavailable(service)
    const known = CODES[error.code]
    if (known) return { tone: known.tone ?? 'error', title: known.title, detail: known.detail, code: error.code }
    if (error.code.startsWith('world_')) {
      return { tone: 'error', title: "World ID couldn't verify this proof.", detail: error.message }
    }
    return { tone: 'error', title: error.message }
  }
  if (error instanceof DOMException && error.name === 'AbortError') {
    return { tone: 'error', title: 'The request was cancelled.' }
  }
  return { tone: 'error', title: describeChainError(error).message }
}

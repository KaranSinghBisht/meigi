// Maps the verifier's signed request context to the shape IDKit expects. The verifier signs with
// `signRequest()` ({ sig, nonce, created_at, expires_at }); IDKit wants `signature` and the RP id.

import type { RpContext } from '@worldcoin/idkit'
import type { RpContextWire } from '../api/verifier'
import { env } from '../env/env'

export class WorldConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorldConfigError'
  }
}

export function toIdkitRpContext(wire: RpContextWire): RpContext {
  const rpId = wire.rp_id ?? env.worldRpId
  const signature = wire.signature ?? wire.sig
  if (!rpId) {
    throw new WorldConfigError('World ID needs the RP id: set VITE_WORLD_RP_ID, or have the verifier return rp_id.')
  }
  if (!signature) throw new WorldConfigError('The verifier sent an unsigned World ID request context.')
  return {
    rp_id: rpId,
    nonce: wire.nonce,
    created_at: wire.created_at,
    expires_at: wire.expires_at,
    signature,
  }
}

/** A context is single-use (its nonce) and short-lived; leave a minute of headroom for the user. */
export function isFresh(wire: RpContextWire, nowSeconds: number = Date.now() / 1000): boolean {
  return wire.expires_at - nowSeconds > 60
}

const SESSION_ID_RE = /^session_[0-9a-fA-F]{128}$/

export function asSessionId(value: string): `session_${string}` | null {
  return SESSION_ID_RE.test(value) ? (value as `session_${string}`) : null
}

/** What the widget reports back, and how to show it: `calm` codes are the person's own choice, not a failure. */
export interface WidgetOutcome {
  readonly message: string
  readonly calm: boolean
}

const WIDGET_ERRORS: Record<string, string> = {
  verification_rejected: 'World ID rejected the verification.',
  connection_failed: "Couldn't connect to World ID. Try again.",
  max_verifications_reached: 'This World ID has reached its verification limit for this app.',
  invalid_rp_signature: "World ID didn't accept the verifier's signature. Check the RP id and signing key.",
  unknown_rp: "World ID doesn't know this RP id. Check VITE_WORLD_RP_ID.",
  invalid_rp_id_format: 'The RP id is malformed. Check VITE_WORLD_RP_ID.',
  inactive_rp: 'This RP id is not active.',
  duplicate_nonce: 'That request was already used. Try again.',
  rp_signature_expired: 'The request expired before it was completed. Try again.',
  timestamp_too_old: 'The request expired before it was completed. Try again.',
  timestamp_too_far_in_future: "This device's clock looks wrong. Check the time and try again.",
  invalid_timestamp: 'The request timestamp was rejected. Try again.',
  malformed_request: 'World ID rejected the request as malformed.',
  invalid_network: 'World ID rejected the network for this request.',
  world_id_4_not_available: "This World ID can't do a 4.0 session. Try World App's latest version.",
  world_id_3_not_available: "This World ID can't complete this request.",
  nullifier_replayed: 'This proof was already used elsewhere. Try again with a fresh one.',
  identity_attributes_not_matched: "World ID couldn't match the requested identity attributes.",
  inclusion_proof_failed: "World couldn't confirm this identity is included yet. Try again shortly.",
}

/** Choosing not to prove, not holding a requested credential, a transient hiccup on World's own side while
 * completing the check, or simply not answering in time, is the person's situation right now, not something
 * broken here: shown calmly, not as an alert. `timeout` and `cancelled` are World's own client-side codes (its
 * SDK's doc comment: "client-side codes ... not from World App"), not a report of anything wrong on either side.
 * Each lead is a short, complete clause; `widgetOutcome` names what didn't happen next to it, so the same code
 * reads correctly in every flow that can hit it (declining an officer enrollment vs. an approval, say). */
const WIDGET_CALM_LEAD: Record<string, string> = {
  user_rejected: 'Declined.',
  cancelled: 'Cancelled.',
  timeout: "World ID didn't answer in time.",
  credential_unavailable: "This credential isn't available on your World ID.",
  feature_unavailable: "This isn't available on your World ID right now.",
  user_presence_failed: "The check didn't complete.",
  failed_by_host_app: "World ID couldn't complete this.",
  unexpected_response: "World ID gave an answer we didn't expect.",
  generic_error: "Something didn't complete on World's side.",
  inclusion_proof_pending: "World is still confirming this identity.",
}

/** `consequence` is a plain past participle for "Nothing was ___": e.g. "added" for an officer enrollment,
 * "approved" for an approval attempt - whatever this proof would otherwise have done. */
export function widgetOutcome(code: string, consequence: string): WidgetOutcome {
  const lead = WIDGET_CALM_LEAD[code]
  if (lead) return { message: `${lead} Nothing was ${consequence}.`, calm: true }
  return { message: WIDGET_ERRORS[code] ?? `World ID failed (${code}).`, calm: false }
}

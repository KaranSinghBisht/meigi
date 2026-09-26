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
  timeout: 'World ID timed out. Try again.',
  max_verifications_reached: 'This World ID has reached its verification limit for this app.',
  invalid_rp_signature: "World ID didn't accept the verifier's signature. Check the RP id and signing key.",
  unknown_rp: "World ID doesn't know this RP id. Check VITE_WORLD_RP_ID.",
  duplicate_nonce: 'That request was already used. Try again.',
  rp_signature_expired: 'The request expired before it was completed. Try again.',
  malformed_request: 'World ID rejected the request as malformed.',
}

/** Choosing not to prove, or not holding a requested credential, is the person's own situation, not something
 * broken: shown calmly, not as an alert. */
const WIDGET_CALM: Record<string, string> = {
  user_rejected: 'Declined in World ID. Nothing changed — try again when you\'re ready.',
  credential_unavailable: "This credential isn't available on your World ID. Nothing changed.",
  cancelled: 'Cancelled. Nothing changed — try again when you\'re ready.',
}

export function widgetOutcome(code: string): WidgetOutcome {
  if (code in WIDGET_CALM) return { message: WIDGET_CALM[code]!, calm: true }
  return { message: WIDGET_ERRORS[code] ?? `World ID failed (${code}).`, calm: false }
}

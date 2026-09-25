import { env } from '../../lib/env/env'
import './stage.css'

/** Arriving through the landing's enter button: its glide ends in a white wash, so the app fades in from white. */
function fromLanding(): boolean {
  if (!env.landingUrl || !document.referrer) return false
  try {
    return new URL(document.referrer).origin === new URL(env.landingUrl, window.location.href).origin
  } catch {
    return false
  }
}

const ARRIVED_FROM_LANDING = typeof document !== 'undefined' && fromLanding()

export function Arrival() {
  return ARRIVED_FROM_LANDING ? <div className="arrival" aria-hidden="true" /> : null
}

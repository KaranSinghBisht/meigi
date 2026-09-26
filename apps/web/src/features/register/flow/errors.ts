import { ApiError } from '../../../lib/api/http'
import { explainError, type Explained } from '../../../lib/api/messages'

/** Retry-After in seconds: from the body if the client ever passes it on, else from the verifier's own wording. */
function retryAfterSeconds(error: ApiError): number | null {
  const fromBody = error.details.retryAfter
  if (typeof fromBody === 'number' && fromBody > 0) return fromBody
  const match = /try again in (\d+)\s*s/.exec(error.message)
  return match ? Number(match[1]) : null
}

function inMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

type Wording = (error: ApiError) => Omit<Explained, 'code'>

/** The verifier's limits and states, said calmly, on the step where they happen. */
const WORDING: Record<string, Wording> = {
  officer_limit: (error) => ({
    tone: 'error',
    title: `This World ID is already an officer of ${/at most (\d+)/.exec(error.message)?.[1] ?? 3} companies.`,
    detail: 'Another officer of this company can enroll instead.',
  }),
  duplicate_open_registration: (error) => ({
    tone: 'error',
    title: 'You already have an open registration for this number.',
    detail: error.message,
  }),
  too_many_officers: () => ({ tone: 'error', title: 'A company can have at most 8 officers.' }),
  already_disputed: () => ({
    tone: 'denied',
    title: 'This number is already disputed.',
    detail: 'Payments to it are frozen until governance resolves the dispute.',
  }),
  registration_expired: () => ({
    tone: 'error',
    title: 'This draft expired after 24 hours.',
    detail: 'Nothing was written on-chain. Start over to open a new one.',
  }),
  rate_limited: (error) => {
    const seconds = retryAfterSeconds(error)
    return {
      tone: 'offline',
      title: 'Too many attempts from this network.',
      detail: seconds ? `Try again in ${inMinutes(seconds)}.` : 'Try again in a few minutes.',
    }
  },
  already_submitted: () => ({
    tone: 'error',
    title: 'This registration was already submitted.',
    detail: 'See where it stands in the registry.',
  }),
}

/** The verifier's wording for a failed call, always keeping its code, so a step can offer the right way on. */
export function explainStep(error: unknown): Explained {
  if (error instanceof ApiError && !error.unavailable) {
    const wording = WORDING[error.code]
    if (wording) return { ...wording(error), code: error.code }
  }
  const explained = explainError(error, 'verifier')
  return error instanceof ApiError && explained.code === undefined ? { ...explained, code: error.code } : explained
}

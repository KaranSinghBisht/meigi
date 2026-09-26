import { ApiError } from '../../../lib/api/http'
import { explainError, type Explained } from '../../../lib/api/messages'

/** The verifier's wording for a failed call, always keeping its code, so a step can react to one it knows. */
export function explainStep(error: unknown): Explained {
  const explained = explainError(error, 'verifier')
  return error instanceof ApiError && explained.code === undefined ? { ...explained, code: error.code } : explained
}

// Which World ID credential an officer proves with, as the verifier's WORLD_OFFICER_CREDENTIALS allows. Selfie
// Check needs only a phone, so the officer demo can run on the production World ID app without an Orb.

import type { ConstraintNode } from '@worldcoin/idkit'
import { env, type OfficerCredential } from '../env/env'

export const CREDENTIAL_NAMES: Record<OfficerCredential, string> = {
  proof_of_human: 'Orb',
  selfie: 'Selfie Check',
}

/** One credential asks for it; several accept any of them (the verifier still checks each proof's credential). */
export function officerConstraint(signal: string, credentials = env.worldOfficerCredentials): ConstraintNode {
  const requests = credentials.map((type) => ({ type, signal }))
  const [only] = requests
  return requests.length === 1 && only ? only : { any: requests }
}

/** e.g. "Selfie Check", or "proof of human or Selfie Check". */
export function credentialLabel(credentials = env.worldOfficerCredentials): string {
  return credentials.map((credential) => CREDENTIAL_NAMES[credential]).join(' or ')
}

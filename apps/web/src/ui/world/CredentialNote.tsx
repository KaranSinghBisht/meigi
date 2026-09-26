import { env } from '../../lib/env/env'
import './world.css'

/** What an officer proves with, in plain words: the credential(s) the verifier accepts (VITE_WORLD_OFFICER_CREDENTIALS). */
export function CredentialNote() {
  const credentials = env.worldOfficerCredentials
  return (
    <div className="credential-note">
      {credentials.length > 1 ? <p>Either credential works:</p> : null}
      {credentials.includes('proof_of_human') ? (
        <p>
          <strong>Proof of human:</strong> a unique human, verified once at an Orb.
        </p>
      ) : null}
      {credentials.includes('selfie') ? (
        <p>
          <strong>Selfie Check:</strong> the same live person, from your phone. No personal data is shared.
        </p>
      ) : null}
    </div>
  )
}

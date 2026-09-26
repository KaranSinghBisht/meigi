import { useState } from 'react'
import type { Explained } from '../../../lib/api/messages'
import { checkDomainProof, createRegistration, type Registration } from '../../../lib/api/verifier'
import { explainStep } from '../flow/errors'
import type { Onboarding } from '../flow/useOnboarding'

/** A fictional company has no real domain: it is recorded under its own name in the reserved .example TLD. */
export function fictionalDomain(tNumber: string): string {
  return `${tNumber.toLowerCase()}.example`
}

/**
 * The verifier's first two calls, unchanged from the registration flow: create the registration (the exact NTA
 * match, and the challenge the business key signs), then check the published domain proof. Each answer is applied
 * only to the answers it was asked for (see useOnboarding), so a slow reply never lands on a changed form.
 */
export function useRegistrationCalls(onboarding: Onboarding) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Explained | null>(null)

  const run = async <T>(call: () => Promise<T>): Promise<T | null> => {
    setBusy(true)
    setError(null)
    try {
      return await call()
    } catch (reason) {
      setError(explainStep(reason))
      return null
    } finally {
      setBusy(false)
    }
  }

  const create = (domain: string) =>
    run(async (): Promise<Registration | null> => {
      const { company, controller, payout } = onboarding.state
      if (!company || !controller || !payout) return null
      const input = { tNumber: company.tNumber, legalName: company.legalName, domain, controller, payout }
      const registration = await createRegistration(input)
      onboarding.created(registration, { company, controller, payout })
      return registration
    })

  const check = (id: string) =>
    run(async () => {
      const { method } = await checkDomainProof(id)
      onboarding.domainVerified(id, method)
      return method
    })

  return { busy, error, create, check }
}

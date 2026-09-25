import { useCallback, useMemo } from 'react'
import type { Hex } from 'viem'
import type { Registration, Submission } from '../../lib/api/verifier'
import type { HexAddress } from '../../lib/env/env'
import { useSessionState } from '../../lib/hooks/useSessionState'

export interface CompanyForm {
  readonly tNumber: string
  readonly legalName: string
  readonly domain: string
  readonly payout: string
}

export interface RegistrationFlow {
  readonly step: number
  readonly form: CompanyForm
  readonly registration: Registration | null
  readonly tNumber: string | null
  readonly controller: HexAddress | null
  readonly signature: Hex | null
  readonly domainMethod: string | null
  readonly officers: readonly string[]
  readonly submission: Submission | null
}

export const STEPS = ['Company', 'Domain proof', 'Officers', 'Submit'] as const

const EMPTY: RegistrationFlow = {
  step: 0,
  form: { tNumber: '', legalName: '', domain: '', payout: '' },
  registration: null,
  tNumber: null,
  controller: null,
  signature: null,
  domainMethod: null,
  officers: [],
  submission: null,
}

/** Accepts what we stored earlier in this tab; anything else starts a fresh flow. */
function revive(value: unknown): RegistrationFlow | null {
  if (typeof value !== 'object' || value === null) return null
  const flow = value as Partial<RegistrationFlow>
  if (typeof flow.step !== 'number' || typeof flow.form !== 'object' || !Array.isArray(flow.officers)) return null
  return { ...EMPTY, ...flow } as RegistrationFlow
}

export function useRegistrationFlow() {
  const [flow, setFlow, reset] = useSessionState<RegistrationFlow>('meigi.register.v1', EMPTY, revive)

  const update = useCallback(
    (patch: Partial<RegistrationFlow> | ((prev: RegistrationFlow) => Partial<RegistrationFlow>)) =>
      setFlow((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })),
    [setFlow],
  )

  return useMemo(
    () => ({
      flow,
      reset,
      setForm: (form: CompanyForm) => update({ form }),
      created: (registration: Registration, tNumber: string, controller: HexAddress) =>
        update({ registration, tNumber, controller, step: 1, signature: null, domainMethod: null, officers: [] }),
      signed: (signature: Hex | null) => update({ signature }),
      domainVerified: (domainMethod: string) => update({ domainMethod, step: 2 }),
      officerAdded: (officerId: string) =>
        update((prev) => ({
          officers: prev.officers.includes(officerId) ? prev.officers : [...prev.officers, officerId],
        })),
      goTo: (step: number) => update({ step }),
      submitted: (submission: Submission) => update({ submission }),
    }),
    [flow, reset, update],
  )
}

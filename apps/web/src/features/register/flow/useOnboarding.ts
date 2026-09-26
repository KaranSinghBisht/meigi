import { useCallback, useMemo } from 'react'
import type { Hex } from 'viem'
import type { Registration, Submission } from '../../../lib/api/verifier'
import type { HexAddress } from '../../../lib/env/env'
import { useSessionState } from '../../../lib/hooks/useSessionState'
import { STEP_COUNT, type StepIndex } from './steps'

export type PayoutMode = 'connected' | 'paste' | 'create'

/** The company as confirmed on the first step: its exact NTA name, or a fictional company's typed name. */
export interface Company {
  readonly tNumber: string
  readonly legalName: string
  readonly address: string
  readonly fixture: boolean
  readonly lei: string | null
}

/** What the reader typed or picked so far, kept so going back never loses it. */
export interface Drafts {
  readonly query: string
  readonly fictionalName: string
  readonly payoutMode: PayoutMode
  readonly pastedPayout: string
  /** A payout wallet made in this browser: only its address, and only once its backup was downloaded. */
  readonly createdPayout: HexAddress | null
  readonly domain: string
}

export interface OnboardingState {
  readonly step: StepIndex
  readonly drafts: Drafts
  readonly company: Company | null
  readonly controller: HexAddress | null
  readonly payout: HexAddress | null
  readonly registration: Registration | null
  readonly signature: Hex | null
  readonly domainMethod: string | null
  readonly officers: readonly string[]
  readonly threshold: number
  readonly submission: Submission | null
}

const EMPTY: OnboardingState = {
  step: 0,
  drafts: { query: '', fictionalName: '', payoutMode: 'create', pastedPayout: '', createdPayout: null, domain: '' },
  company: null,
  controller: null,
  payout: null,
  registration: null,
  signature: null,
  domainMethod: null,
  officers: [],
  threshold: 1,
  submission: null,
}

/** Accepts what this tab stored earlier; anything else starts a fresh onboarding. */
function revive(value: unknown): OnboardingState | null {
  if (typeof value !== 'object' || value === null) return null
  const state = value as Partial<OnboardingState>
  const stepOk = typeof state.step === 'number' && state.step >= 0 && state.step < STEP_COUNT
  if (!stepOk || typeof state.drafts !== 'object' || !Array.isArray(state.officers)) return null
  return { ...EMPTY, ...state, drafts: { ...EMPTY.drafts, ...state.drafts } } as OnboardingState
}

/** Everything the verifier's registration carries: confirming steps 1–2 again always starts it afresh. */
const UNREGISTERED = {
  registration: null,
  signature: null,
  domainMethod: null,
  officers: [],
  threshold: 1,
  submission: null,
} as const satisfies Partial<OnboardingState>

type Patch = Partial<OnboardingState> | ((prev: OnboardingState) => Partial<OnboardingState>)

/** Steps 1–2 feed the verifier's registration: once it exists, changing them means starting over. */
export function canRevisit(state: OnboardingState, step: number): boolean {
  if (state.submission || step >= state.step) return false
  return state.registration === null || step >= 2
}

export function useOnboarding() {
  const [state, setState, reset] = useSessionState<OnboardingState>('meigi.onboarding.v1', EMPTY, revive)

  const update = useCallback(
    (patch: Patch) => setState((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })),
    [setState],
  )

  const actions = useMemo(
    () => ({
      reset,
      setDrafts: (drafts: Partial<Drafts>) => update((prev) => ({ drafts: { ...prev.drafts, ...drafts } })),
      confirmCompany: (company: Company) => update({ ...UNREGISTERED, company, step: 1 }),
      confirmWallets: (controller: HexAddress, payout: HexAddress) =>
        update({ ...UNREGISTERED, controller, payout, step: 2 }),
      created: (registration: Registration) => update({ ...UNREGISTERED, registration }),
      signed: (signature: Hex | null) => update({ signature }),
      domainVerified: (domainMethod: string) => update({ domainMethod, step: 3 }),
      officerAdded: (officerId: string) =>
        update((prev) => ({
          officers: prev.officers.includes(officerId) ? prev.officers : [...prev.officers, officerId],
        })),
      setThreshold: (threshold: number) => update({ threshold }),
      goTo: (step: StepIndex) => update({ step }),
      submitted: (submission: Submission) => update({ submission, step: 5 }),
    }),
    [reset, update],
  )

  return { state, ...actions }
}

export type Onboarding = ReturnType<typeof useOnboarding>

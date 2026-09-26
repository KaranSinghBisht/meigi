import { useCallback, useMemo } from 'react'
import type { Hex } from 'viem'
import type { Registration, Submission } from '../../../lib/api/verifier'
import type { HexAddress } from '../../../lib/env/env'
import { useSessionState } from '../../../lib/hooks/useSessionState'
import { STEP, STEP_COUNT, type StepIndex } from './steps'

export type PayoutMode = 'connected' | 'paste' | 'create'

/** The company as confirmed on the first step: its exact NTA name, or a fictional company's typed name. */
export interface Company {
  readonly tNumber: string
  readonly legalName: string
  /** The NTA-registered address; empty for a fictional company. */
  readonly address: string
  readonly fixture: boolean
  /** The LEI the company was found by, when it was pasted instead of the T-number. */
  readonly lei: string | null
}

/** What the reader typed or picked so far, kept so going back never loses it. */
export interface Drafts {
  readonly query: string
  readonly fictionalName: string
  readonly payoutMode: PayoutMode
  readonly pastedPayout: string
  /** A payout wallet made in this browser: only its address, and only once its backup was saved. */
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
  /** Approvals needed per change; null until chosen (the review then suggests 2 of n, as before). */
  readonly threshold: number | null
  readonly submission: Submission | null
}

/** The answers a verifier registration was created from. */
export interface RegistrationBasis {
  readonly company: Company
  readonly controller: HexAddress
  readonly payout: HexAddress
}

/** Everything the verifier's registration carries: confirming steps 1–2 again always starts it afresh. */
const UNREGISTERED = {
  registration: null,
  signature: null,
  domainMethod: null,
  officers: [],
  threshold: null,
  submission: null,
} as const satisfies Partial<OnboardingState>

const EMPTY: OnboardingState = {
  step: STEP.company,
  drafts: { query: '', fictionalName: '', payoutMode: 'create', pastedPayout: '', createdPayout: null, domain: '' },
  company: null,
  controller: null,
  payout: null,
  ...UNREGISTERED,
}

/** Accepts what this tab stored earlier; anything else starts a fresh onboarding. */
function revive(value: unknown): OnboardingState | null {
  if (typeof value !== 'object' || value === null) return null
  const state = value as Partial<OnboardingState>
  const stepOk = typeof state.step === 'number' && state.step >= 0 && state.step < STEP_COUNT
  if (!stepOk || typeof state.drafts !== 'object' || !Array.isArray(state.officers)) return null
  return { ...EMPTY, ...state, drafts: { ...EMPTY.drafts, ...state.drafts } } as OnboardingState
}

/** Steps 1–2 feed the verifier's registration: once it exists, changing them means starting over. */
export function canRevisit(state: OnboardingState, step: number): boolean {
  if (state.submission || step >= state.step) return false
  return state.registration === null || step >= STEP.domain
}

/** Null leaves the state as it is: an answer that arrived for a registration the reader has since left. */
type Patch = (prev: OnboardingState) => Partial<OnboardingState> | null

const isBasis = (prev: OnboardingState, basis: RegistrationBasis) =>
  prev.registration === null &&
  prev.company === basis.company &&
  prev.controller === basis.controller &&
  prev.payout === basis.payout

/** Patches that apply only while `id` is still the registration on screen. */
function forRegistration(id: string, patch: Patch): Patch {
  return (prev) => (prev.registration?.id === id ? patch(prev) : null)
}

function useActions(update: (patch: Patch) => void) {
  return useMemo(
    () => ({
      setDrafts: (drafts: Partial<Drafts>) => update((prev) => ({ drafts: { ...prev.drafts, ...drafts } })),
      confirmCompany: (company: Company) => update(() => ({ ...UNREGISTERED, company, step: STEP.wallets })),
      confirmWallets: (controller: HexAddress, payout: HexAddress) =>
        update(() => ({ ...UNREGISTERED, controller, payout, step: STEP.domain })),
      created: (registration: Registration, basis: RegistrationBasis) =>
        update((prev) => (isBasis(prev, basis) ? { ...UNREGISTERED, registration } : null)),
      signed: (id: string, signature: Hex | null) => update(forRegistration(id, () => ({ signature }))),
      domainVerified: (id: string, domainMethod: string) =>
        update(forRegistration(id, () => ({ domainMethod, step: STEP.representative }))),
      officerAdded: (id: string, officerId: string) =>
        update(
          forRegistration(id, (prev) => ({
            officers: prev.officers.includes(officerId) ? prev.officers : [...prev.officers, officerId],
          })),
        ),
      setThreshold: (threshold: number) => update(() => ({ threshold })),
      goTo: (step: StepIndex) => update(() => ({ step })),
      submitted: (id: string, submission: Submission) =>
        update(forRegistration(id, () => ({ submission, step: STEP.registered }))),
    }),
    [update],
  )
}

const STORAGE_KEY = 'meigi.onboarding.v2'
/** The registration left behind by the last Start over in this tab, so it can be picked up again. */
const PREVIOUS_KEY = 'meigi.onboarding.previous'

function readPrevious(): OnboardingState | null {
  try {
    const raw = window.sessionStorage.getItem(PREVIOUS_KEY)
    return raw === null ? null : revive(JSON.parse(raw))
  } catch {
    return null // Unreadable or unavailable storage: there is simply nothing to pick up.
  }
}

function writePrevious(state: OnboardingState | null): void {
  try {
    if (state) window.sessionStorage.setItem(PREVIOUS_KEY, JSON.stringify(state))
    else window.sessionStorage.removeItem(PREVIOUS_KEY)
  } catch {
    // Not kept: storage is unavailable. Starting over still works; only the way back is lost.
  }
}

/** Start over, keeping an unsubmitted registration aside; and pick that registration up again. */
function useRestart(state: OnboardingState, setState: (state: OnboardingState) => void, clear: () => void) {
  const reset = useCallback(() => {
    if (state.registration && !state.submission) writePrevious(state)
    clear()
  }, [state, clear])
  const resume = useCallback(() => {
    const previous = readPrevious()
    if (!previous) return
    writePrevious(null)
    setState(previous)
  }, [setState])
  return { reset, resume, previous: readPrevious }
}

export function useOnboarding() {
  const [state, setState, clear] = useSessionState<OnboardingState>(STORAGE_KEY, EMPTY, revive)
  const update = useCallback(
    (patch: Patch) =>
      setState((prev) => {
        const next = patch(prev)
        return next ? { ...prev, ...next } : prev
      }),
    [setState],
  )
  const actions = useActions(update)
  const restart = useRestart(state, setState, clear)
  return { state, ...restart, ...actions }
}

export type Onboarding = ReturnType<typeof useOnboarding>

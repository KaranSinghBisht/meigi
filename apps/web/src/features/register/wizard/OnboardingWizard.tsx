import { useEffect, useRef, type ReactNode } from 'react'
import { prefersReducedMotion } from '../../../lib/hooks/motion'
import { CompanyStep } from '../company/CompanyStep'
import { DomainStep } from '../domain/DomainStep'
import { skippedSteps, STEP, type StepIndex } from '../flow/steps'
import { canRevisit, useOnboarding, type Onboarding, type OnboardingState } from '../flow/useOnboarding'
import { OfficersStep } from '../officers/OfficersStep'
import { RegisteredStep } from '../registered/RegisteredStep'
import { RepresentativeStep } from '../representative/RepresentativeStep'
import { ReviewStep } from '../review/ReviewStep'
import { WalletsStep } from '../wallets/WalletsStep'
import { ProgressRail } from './ProgressRail'
import { RailNeeds } from './RailNeeds'
import { StartOver } from './StartOver'
import { useDirection } from './useDirection'

/** The furthest screen the saved state can back up: a step never shows before what it needs exists. */
function visibleStep(state: OnboardingState): StepIndex {
  if (!state.company || state.step === STEP.company) return STEP.company
  if (state.step === STEP.wallets || !state.controller || !state.payout) return STEP.wallets
  if (state.step === STEP.domain || !state.registration || !state.domainMethod) return STEP.domain
  if (state.step === STEP.representative) return STEP.representative
  if (state.step === STEP.officers || state.officers.length === 0) return STEP.officers
  return state.step === STEP.review || !state.submission ? STEP.review : STEP.registered
}

/** Where the reader is, finer than the step: proving a domain takes three screens (domain, signature, record). */
function screenOf(state: OnboardingState, step: StepIndex): number {
  if (step !== STEP.domain || state.domainMethod || state.company?.fixture) return step
  if (!state.registration) return step
  return state.signature ? step + 0.2 : step + 0.1
}

const SCREENS: Record<StepIndex, (props: { readonly onboarding: Onboarding }) => ReactNode> = {
  [STEP.company]: CompanyStep,
  [STEP.wallets]: WalletsStep,
  [STEP.domain]: DomainStep,
  [STEP.representative]: RepresentativeStep,
  [STEP.officers]: OfficersStep,
  [STEP.review]: ReviewStep,
  [STEP.registered]: RegisteredStep,
}

function CurrentStep({ onboarding, step }: { readonly onboarding: Onboarding; readonly step: StepIndex }) {
  const Screen = SCREENS[step]
  return <Screen onboarding={onboarding} />
}

/**
 * A new screen takes focus at its question, and the window scrolls back into view if its top is hidden. It compares
 * with the screen it last saw, so a first paint (or StrictMode's second effect run) never moves focus.
 */
function useStepFocus(screen: number) {
  const windowRef = useRef<HTMLDivElement>(null)
  const seen = useRef(screen)
  useEffect(() => {
    if (seen.current === screen) return
    seen.current = screen
    const node = windowRef.current
    node?.querySelector<HTMLElement>('.onboard-step__title')?.focus({ preventScroll: true })
    if (node && node.getBoundingClientRect().top < 0) {
      node.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    }
  }, [screen])
  return windowRef
}

function RailFooter({ onboarding, finished }: { readonly onboarding: Onboarding; readonly finished: boolean }) {
  const started = onboarding.state.drafts.query !== '' || onboarding.state.company !== null
  return (
    <>
      <RailNeeds />
      {started ? <StartOver onReset={onboarding.reset} finished={finished} className="rail__restart" /> : null}
    </>
  )
}

export function OnboardingWizard() {
  const onboarding = useOnboarding()
  const { state } = onboarding
  const step = visibleStep(state)
  const screen = screenOf(state, step)
  const direction = useDirection(screen)
  const windowRef = useStepFocus(screen)
  const disputed = step === STEP.registered && state.submission?.outcome === 'disputed'
  return (
    <div ref={windowRef} className="onboard window cells">
      <ProgressRail
        current={step}
        finished={step === STEP.registered && !disputed}
        skipped={skippedSteps({ fixture: state.company?.fixture === true })}
        outcome={disputed ? 'Claim disputed' : undefined}
        canVisit={(target) => canRevisit({ ...state, step }, target)}
        onVisit={onboarding.goTo}
        footer={<RailFooter onboarding={onboarding} finished={step === STEP.registered} />}
      />
      <div className="onboard__stage">
        {/* A different registration (one picked up again) is a fresh screen: no answer from the last one lingers. */}
        <div key={`${screen}:${state.registration?.id ?? ''}`} className={`onboard__screen onboard__screen--${direction}`}>
          <CurrentStep onboarding={onboarding} step={step} />
        </div>
      </div>
    </div>
  )
}

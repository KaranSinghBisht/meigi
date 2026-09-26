import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../../lib/hooks/motion'
import { CompanyStep } from '../company/CompanyStep'
import { DomainStep } from '../domain/DomainStep'
import { canRevisit, useOnboarding, type Onboarding, type OnboardingState } from '../flow/useOnboarding'
import type { StepIndex } from '../flow/steps'
import { OfficersStep } from '../officers/OfficersStep'
import { ReviewStep } from '../review/ReviewStep'
import { VerifiedStep } from '../verified/VerifiedStep'
import { WalletsStep } from '../wallets/WalletsStep'
import { ProgressRail } from './ProgressRail'
import { StartOver } from './StartOver'

/** The furthest screen the saved state can back up: a step never shows before what it needs exists. */
function visibleStep(state: OnboardingState): StepIndex {
  if (!state.company) return 0
  if (state.step < 2 || !state.controller || !state.payout) return state.step === 0 ? 0 : 1
  if (state.step < 3 || !state.registration || !state.domainMethod) return 2
  if (state.step < 4 || state.officers.length === 0) return 3
  return state.step < 5 || !state.submission ? 4 : 5
}

/** Where the reader is, finer than the step: proving a domain takes three screens (domain, signature, record). */
function screenOf(state: OnboardingState, step: StepIndex): number {
  if (step !== 2 || state.domainMethod || state.company?.fixture) return step
  if (!state.registration) return 2
  return state.signature ? 2.2 : 2.1
}

function CurrentStep({ onboarding, step }: { readonly onboarding: Onboarding; readonly step: StepIndex }) {
  if (step === 0) return <CompanyStep onboarding={onboarding} />
  if (step === 1) return <WalletsStep onboarding={onboarding} />
  if (step === 2) return <DomainStep onboarding={onboarding} />
  if (step === 3) return <OfficersStep onboarding={onboarding} />
  if (step === 4) return <ReviewStep onboarding={onboarding} />
  return <VerifiedStep onboarding={onboarding} />
}

type Direction = 'none' | 'forward' | 'back'

/** Which way the last screen change went, so the new screen slides in from that side. None on first paint. */
function useDirection(screen: number): Direction {
  const [seen, setSeen] = useState<{ screen: number; direction: Direction }>({ screen, direction: 'none' })
  if (seen.screen === screen) return seen.direction
  const direction: Direction = screen > seen.screen ? 'forward' : 'back'
  setSeen({ screen, direction })
  return direction
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
      <div className="rail__needs">
        <p className="rail__needs-title">You'll need</p>
        <ul className="rail__needs-list">
          <li>Your T-number or LEI</li>
          <li>A browser wallet</li>
          <li>Access to your domain's DNS</li>
          <li>World App for each officer</li>
        </ul>
      </div>
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
  const disputed = step === 5 && state.submission?.outcome === 'disputed'
  return (
    <div ref={windowRef} className="onboard window cells">
      <ProgressRail
        current={step}
        finished={step === 5 && !disputed}
        outcome={disputed ? 'Claim disputed' : undefined}
        canVisit={(target) => canRevisit({ ...state, step }, target)}
        onVisit={onboarding.goTo}
        footer={<RailFooter onboarding={onboarding} finished={step === 5} />}
      />
      <div className="onboard__stage">
        <div key={screen} className={`onboard__screen onboard__screen--${direction}`}>
          <CurrentStep onboarding={onboarding} step={step} />
        </div>
      </div>
    </div>
  )
}

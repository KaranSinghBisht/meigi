import { useEffect, useRef, type ReactNode } from 'react'
import { env } from '../../../lib/env/env'
import { Button, LinkButton } from '../../../ui/components/Button'
import { skippedSteps, type StepIndex } from '../flow/steps'
import { ProgressRail } from '../wizard/ProgressRail'
import { RailNeeds } from '../wizard/RailNeeds'
import { StepActions } from '../wizard/StepFrame'
import { useDirection } from '../wizard/useDirection'
import { RECORDING } from './recording'
import { ReplayScreen } from './ReplayScreens'
import { useReplay, type Replay } from './useReplay'
import './replay.css'

const TALK = `mailto:${env.contactEmail}?subject=${encodeURIComponent('Meigi beta')}`

/** The one honest line, and the replay's own controls: play or pause, and the way to get in touch. */
function ReplayBar({ replay }: { readonly replay: Replay }) {
  return (
    <div className="replay-bar">
      <p className="replay-bar__note">
        <strong>Replay of a registration on Sepolia</strong> · registering your own company opens with the beta
      </p>
      <div className="replay-bar__actions">
        <Button variant="ghost" size="sm" data-replay-toggle onClick={replay.toggle}>
          {replay.atEnd ? 'Replay again' : replay.playing ? 'Pause' : 'Play'}
        </Button>
        {replay.atEnd ? null : (
          <a className="btn btn--primary btn--sm" href={TALK}>
            Talk to us
          </a>
        )}
      </div>
    </div>
  )
}

/** Back and Next, where the live wizard has Back and Continue; the last screen leads on instead. */
function actionsFor(replay: Replay, tNumber: string): ReactNode {
  if (replay.atEnd) {
    return (
      <StepActions onBack={() => replay.go(replay.step - 1)}>
        <LinkButton to={`/registry/${tNumber}`} variant="ghost" size="lg">
          View in the registry
        </LinkButton>
        <a className="btn btn--primary btn--lg" href={TALK}>
          Talk to us
        </a>
      </StepActions>
    )
  }
  return (
    <StepActions onBack={replay.step > 0 ? () => replay.go(replay.step - 1) : undefined}>
      <Button size="lg" onClick={() => replay.go(replay.step + 1)}>
        Next
      </Button>
    </StepActions>
  )
}

/** After the reader moves (not autoplay), focus follows to the new screen's question, as in the live wizard. */
function useManualFocus(replay: Replay) {
  const windowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!replay.manual.current) return
    replay.manual.current = false
    windowRef.current?.querySelector<HTMLElement>('.onboard-step__title')?.focus({ preventScroll: true })
  }, [replay.step, replay.manual])
  return windowRef
}

/**
 * The hosted /register: the real wizard's window, rail and screens, replaying a registration that happened on
 * Sepolia. It plays by itself, pauses as soon as the reader steps in, and ends on the live payee card.
 */
export function RegisterReplay() {
  const replay = useReplay()
  const direction = useDirection(replay.step)
  const windowRef = useManualFocus(replay)
  const recording = RECORDING
  const placeholderOfficers = recording.officers.some((officer) => officer.proof === 'placeholder')
  const skipped = skippedSteps({ fixture: recording.company.fixture, placeholderOfficers })
  // Any pointer or key inside the window stops the autoplay, except the play/pause button itself.
  const interrupt = (event: { readonly target: EventTarget | null }) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-replay-toggle]')) replay.pause()
  }
  return (
    <div ref={windowRef} className="onboard onboard--replay window cells" onPointerDown={interrupt} onKeyDown={interrupt}>
      <ReplayBar replay={replay} />
      <ProgressRail
        current={replay.step}
        finished={replay.atEnd}
        skipped={skipped}
        canVisit={(step: StepIndex) => step !== replay.step}
        onVisit={replay.go}
        footer={<RailNeeds />}
      />
      <div className="onboard__stage">
        <div key={replay.step} className={`onboard__screen onboard__screen--${direction}`}>
          <ReplayScreen
            step={replay.step}
            recording={recording}
            actions={actionsFor(replay, recording.company.tNumber)}
          />
        </div>
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { STEP_COUNT, STEPS, type StepIndex } from '../flow/steps'
import './rail.css'

type ItemState = 'done' | 'current' | 'upcoming'

interface ProgressRailProps {
  /** The screen on show; -1 previews the steps without a current one. */
  readonly current: number
  /** True once the last step is reached: every marker is a tick. */
  readonly finished?: boolean
  readonly canVisit?: (step: StepIndex) => boolean
  readonly onVisit?: (step: StepIndex) => void
  readonly footer?: ReactNode
}

function stateOf(index: number, current: number, finished: boolean): ItemState {
  if (finished || index < current) return 'done'
  return index === current ? 'current' : 'upcoming'
}

function Marker({ index, state }: { readonly index: number; readonly state: ItemState }) {
  return (
    <span className="rail__marker" aria-hidden="true">
      {state === 'done' ? '✓' : index + 1}
    </span>
  )
}

interface ItemProps {
  readonly index: StepIndex
  readonly label: string
  readonly state: ItemState
  readonly onVisit: ((step: StepIndex) => void) | null
}

function RailItem({ index, label, state, onVisit }: ItemProps) {
  const text = (
    <>
      <Marker index={index} state={state} />
      <span className="rail__label">{label}</span>
      {state === 'done' ? <span className="sr-only"> (done)</span> : null}
    </>
  )
  const className = `rail__item rail__item--${state}`
  if (onVisit) {
    return (
      <button type="button" className={`${className} rail__item--link`} onClick={() => onVisit(index)}>
        {text}
      </button>
    )
  }
  return (
    <span className={className} aria-current={state === 'current' ? 'step' : undefined}>
      {text}
    </span>
  )
}

/** The onboarding's progress: every step by name on a wide window, a segmented bar on a phone. */
export function ProgressRail({ current, finished = false, canVisit, onVisit, footer }: ProgressRailProps) {
  const reached = finished ? STEP_COUNT : Math.max(current, 0)
  return (
    <nav className="rail" aria-label="Onboarding progress">
      <div className="rail__head">
        <p className="eyebrow">Company onboarding</p>
        <p className="rail__title">Join the Meigi registry</p>
      </div>
      <div className="rail__bar" aria-hidden="true">
        {STEPS.map((label, index) => (
          <span key={label} className={index < reached || index === current ? 'rail__seg is-on' : 'rail__seg'} />
        ))}
      </div>
      <ol className="rail__list">
        {STEPS.map((label, index) => {
          const step = index as StepIndex
          const visit = onVisit && canVisit?.(step) ? onVisit : null
          return (
            <li key={label}>
              <RailItem index={step} label={label} state={stateOf(index, current, finished)} onVisit={visit} />
            </li>
          )
        })}
      </ol>
      {footer ? <div className="rail__foot">{footer}</div> : null}
    </nav>
  )
}

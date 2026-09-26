import type { ReactNode } from 'react'
import { STEP_COUNT, STEPS, type StepIndex } from '../flow/steps'
import './rail.css'

/** `skipped`: passed, but not done (a demo company's domain, representation not built yet): a dash, never a tick. */
type ItemState = 'done' | 'skipped' | 'current' | 'upcoming'

interface ProgressRailProps {
  /** The screen on show; -1 previews the steps without a current one. */
  readonly current: number
  /** True once the last step is reached: every marker is a tick. */
  readonly finished?: boolean
  /** Steps passed without being done; they end with a dash instead of a tick. */
  readonly skipped?: readonly number[]
  /** The last step's name when the outcome isn't a registered payee (a disputed claim). */
  readonly outcome?: string
  readonly canVisit?: (step: StepIndex) => boolean
  readonly onVisit?: (step: StepIndex) => void
  readonly head?: ReactNode
  readonly footer?: ReactNode
}

function stateOf(index: number, current: number, finished: boolean, skipped: readonly number[]): ItemState {
  if (index === current && !finished) return 'current'
  if (finished || index < current) return skipped.includes(index) ? 'skipped' : 'done'
  return 'upcoming'
}

const MARKS: Partial<Record<ItemState, string>> = { done: '✓', skipped: '–' }
const SPOKEN: Partial<Record<ItemState, string>> = { done: ' (done)', skipped: ' (skipped)' }

interface ItemProps {
  readonly index: StepIndex
  readonly label: string
  readonly state: ItemState
  readonly onVisit: ((step: StepIndex) => void) | null
}

function RailItem({ index, label, state, onVisit }: ItemProps) {
  const text = (
    <>
      <span className="rail__marker" aria-hidden="true">
        {MARKS[state] ?? index + 1}
      </span>
      <span className="rail__label">{label}</span>
      {SPOKEN[state] ? <span className="sr-only">{SPOKEN[state]}</span> : null}
    </>
  )
  const className = `rail__item rail__item--${state}`
  if (onVisit) {
    return (
      <button
        type="button"
        className={`${className} rail__item--link`}
        aria-current={state === 'current' ? 'step' : undefined}
        onClick={() => onVisit(index)}
      >
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
export function ProgressRail(props: ProgressRailProps) {
  const { current, finished = false, skipped = [], outcome, canVisit, onVisit, head, footer } = props
  const reached = finished ? STEP_COUNT : Math.max(current, 0)
  return (
    <nav className="rail" aria-label="Onboarding progress">
      <div className="rail__head">
        {head ?? (
          <>
            <p className="eyebrow">Company onboarding</p>
            <p className="rail__title">Join the Meigi registry</p>
          </>
        )}
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
          const name = outcome && index === STEP_COUNT - 1 ? outcome : label
          const state = stateOf(index, current, finished, skipped)
          return (
            <li key={label}>
              <RailItem index={step} label={name} state={state} onVisit={visit} />
            </li>
          )
        })}
      </ol>
      {footer ? <div className="rail__foot">{footer}</div> : null}
    </nav>
  )
}

import { useId, type FormEvent, type ReactNode } from 'react'
import { Button } from '../../../ui/components/Button'
import { STEP_COUNT, type StepIndex } from '../flow/steps'

interface StepFrameProps {
  readonly step: StepIndex
  readonly title: ReactNode
  readonly lede?: ReactNode
  readonly children?: ReactNode
  readonly actions?: ReactNode
  /** Makes the screen a form, so Enter continues. */
  readonly onSubmit?: () => void
}

/** One screen of the onboarding: which step, the one question it asks, then its answer and actions. */
export function StepFrame({ step, title, lede, children, actions, onSubmit }: StepFrameProps) {
  const titleId = useId()
  const head = (
    <header className="onboard-step__head">
      <p className="eyebrow">
        Step {step + 1} of {STEP_COUNT}
      </p>
      <h2 id={titleId} className="onboard-step__title" tabIndex={-1}>
        {title}
      </h2>
      {lede ? <p className="onboard-step__lede">{lede}</p> : null}
    </header>
  )
  const body = children ? <div className="onboard-step__body">{children}</div> : null
  if (!onSubmit) {
    return (
      <section className="onboard-step" aria-labelledby={titleId}>
        {head}
        {body}
        {actions}
      </section>
    )
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form className="onboard-step" aria-labelledby={titleId} onSubmit={submit} noValidate>
      {head}
      {body}
      {actions}
    </form>
  )
}

interface StepActionsProps {
  readonly onBack?: () => void
  readonly children?: ReactNode
}

/** Back on the left, the way forward on the right. Every button in the row is the same 52 px height. */
export function StepActions({ onBack, children }: StepActionsProps) {
  return (
    <div className="onboard-actions">
      {onBack ? (
        <Button variant="quiet" size="lg" onClick={onBack}>
          Back
        </Button>
      ) : null}
      <div className="onboard-actions__main">{children}</div>
    </div>
  )
}

import './steps.css'

interface StepsProps {
  readonly steps: readonly string[]
  /** Index of the current step; earlier steps are done. */
  readonly current: number
  readonly label: string
}

export function Steps({ steps, current, label }: StepsProps) {
  return (
    <nav aria-label={label}>
      <ol className="steps">
        {steps.map((step, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'upcoming'
          return (
            <li
              key={step}
              className={`steps__item steps__item--${state}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="steps__marker" aria-hidden="true">
                {state === 'done' ? '✓' : index + 1}
              </span>
              <span className="steps__label">
                {step}
                {state === 'done' ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

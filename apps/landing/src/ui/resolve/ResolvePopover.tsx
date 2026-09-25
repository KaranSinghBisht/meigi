import { useId, useState, type FormEvent, type RefObject } from 'react'
import { env } from '../../lib/env/env'
import { ResolveResult } from './ResolveResult'
import { usePopover } from './usePopover'
import { useResolver, type ResolveState } from './useResolver'
import './resolve.css'

interface PanelProps {
  readonly id: string
  readonly panelRef: RefObject<HTMLDivElement | null>
  readonly inputRef: RefObject<HTMLInputElement | null>
  readonly state: ResolveState
  readonly onResolve: (value: string) => void
}

function ResolvePanel({ id, panelRef, inputRef, state, onResolve }: PanelProps) {
  const [value, setValue] = useState('')
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onResolve(value)
  }

  return (
    <div ref={panelRef} id={id} className="resolve" role="dialog" aria-label="Resolve a T-number">
      <form className="resolve__form" onSubmit={onSubmit} noValidate>
        <label className="resolve__label" htmlFor={inputId}>
          Invoice registration number
        </label>
        <div className="resolve__row">
          <input
            ref={inputRef}
            id={inputId}
            className="resolve__input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="T2011001234567"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            aria-describedby={state.status === 'invalid' ? `${hintId} ${errorId}` : hintId}
            aria-invalid={state.status === 'invalid'}
          />
          <button type="submit" className="resolve__go">
            Resolve
          </button>
        </div>
        <p id={hintId} className="resolve__hint">
          {env.registry ? 'T + 13 digits · reads payeeOf on Sepolia' : "T + 13 digits · the registry isn't deployed yet"}
        </p>
      </form>
      <div className="resolve__result" aria-live="polite">
        <ResolveResult state={state} errorId={errorId} />
      </div>
    </div>
  )
}

/** "Resolve a T-number": a frosted popover that reads payeeOf from the registry. */
export function ResolvePopover() {
  const { state, resolve, reset } = useResolver()
  const { open, toggle, trigger, panel, input } = usePopover(reset)
  const panelId = useId()

  return (
    <div className="dock__anchor">
      <button
        ref={trigger}
        type="button"
        className="pill"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={toggle}
      >
        Resolve a T-number
      </button>
      {open && (
        <ResolvePanel
          id={panelId}
          panelRef={panel}
          inputRef={input}
          state={state}
          onResolve={(value) => void resolve(value)}
        />
      )}
    </div>
  )
}

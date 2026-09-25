import { useEffect, useId, useState, type FormEvent } from 'react'
import { FIXTURE_T_NUMBER, parseTNumber, type ParsedTNumber } from '../../lib/chain/tNumber'
import { Button } from '../../ui/components/Button'
import '../../ui/components/field.css'
import './registry.css'

interface TNumberSearchProps {
  readonly initial?: string
  readonly onSubmit: (tNumber: ParsedTNumber) => void
  readonly submitLabel?: string
  readonly label?: string
}

/** Validates on submit against /^T?\d{13}$/, forgiving spaces, hyphens and a lower-case t. */
function useTNumberInput(initial: string, onSubmit: (tNumber: ParsedTNumber) => void) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setValue(initial), [initial])
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseTNumber(value)
    if (!parsed) {
      setError(`Use "T" followed by 13 digits, for example ${FIXTURE_T_NUMBER}.`)
      return
    }
    setError(null)
    setValue(parsed.display)
    onSubmit(parsed)
  }
  return { value, setValue, error, submit }
}

export function TNumberSearch(props: TNumberSearchProps) {
  const { initial = '', onSubmit, submitLabel = 'Look up', label = 'T-number' } = props
  const { value, setValue, error, submit } = useTNumberInput(initial, onSubmit)
  const id = useId()
  return (
    <form className="tsearch" onSubmit={submit} role="search" noValidate>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="tsearch__row">
        <input
          id={id}
          className="input input--mono tsearch__input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={FIXTURE_T_NUMBER}
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <Button type="submit">{submitLabel}</Button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </form>
  )
}

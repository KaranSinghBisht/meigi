import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import './field.css'

interface FieldFrameProps {
  readonly label: ReactNode
  readonly hint?: ReactNode
  readonly error?: string | null
  readonly children: (ids: { id: string; describedBy: string | undefined }) => ReactNode
}

function FieldFrame({ label, hint, error, children }: FieldFrameProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly label: ReactNode
  readonly hint?: ReactNode
  readonly error?: string | null
  readonly mono?: boolean
}

export function TextField({ label, hint, error, mono, className, ...rest }: TextFieldProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <input
          {...rest}
          id={id}
          className={['input', mono ? 'input--mono' : '', className ?? ''].filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldFrame>
  )
}

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  readonly label: ReactNode
  readonly hint?: ReactNode
  readonly error?: string | null
}

export function TextArea({ label, hint, error, className, ...rest }: TextAreaProps) {
  return (
    <FieldFrame label={label} hint={hint} error={error}>
      {({ id, describedBy }) => (
        <textarea
          {...rest}
          id={id}
          className={className ? `input input--area ${className}` : 'input input--area'}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
    </FieldFrame>
  )
}

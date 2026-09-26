import type { PayoutMode } from '../flow/useOnboarding'

const OPTIONS: readonly { mode: PayoutMode; title: string; body: string }[] = [
  { mode: 'create', title: 'Create a new wallet', body: 'A fresh payout wallet, made in this browser.' },
  { mode: 'connected', title: 'Use my business wallet', body: 'Payments go to the wallet connected above.' },
  { mode: 'paste', title: 'Paste an address', body: 'A treasury or multisig you already use.' },
]

interface PayoutChoiceProps {
  readonly mode: PayoutMode
  readonly onMode?: (mode: PayoutMode) => void
  /** A replay shows the choice that was made, without letting it be changed. */
  readonly disabled?: boolean
}

/** Where payments go: three ways to name the one payout address. */
export function PayoutChoice({ mode, onMode, disabled = false }: PayoutChoiceProps) {
  return (
    <fieldset className="payout-choice" disabled={disabled}>
      <legend className="sr-only">How to set the payout address</legend>
      {OPTIONS.map((option) => (
        <label key={option.mode} className="payout-option">
          <input
            type="radio"
            name="payout-mode"
            value={option.mode}
            checked={mode === option.mode}
            onChange={() => onMode?.(option.mode)}
          />
          <span className="payout-option__text">
            <span className="payout-option__title">{option.title}</span>
            <span className="payout-option__body">{option.body}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

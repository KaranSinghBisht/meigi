import { useState, type FormEvent } from 'react'
import { getAddress } from 'viem'
import type { IntentAction } from '../../lib/api/verifier'
import { addressProblem } from '../../lib/chain/addressInput'
import type { PayeeSnapshot } from '../../lib/chain/registry'
import { Button } from '../../ui/components/Button'
import { TextField } from '../../ui/components/Field'
import type { IntentRequest } from './useIntent'
import './change.css'

interface Option {
  readonly action: IntentAction
  readonly title: string
  readonly body: string
  readonly needsAddress?: string
  readonly unavailable?: (payee: PayeeSnapshot) => string | null
}

const OPTIONS: readonly Option[] = [
  {
    action: 'PayoutChange',
    title: 'Change the payout address',
    body: 'Business key + officer quorum, then 72 h in public. Cancellable until it lands.',
    needsAddress: 'New payout address',
    unavailable: (p) => (p.rotationLandsAt ? 'Blocked while a controller rotation is pending.' : null),
  },
  {
    action: 'ControllerRotation',
    title: 'Replace a lost business key',
    body: 'Officers only. The current controller can still cancel it during the 72 h.',
    needsAddress: 'New controller address',
  },
  {
    action: 'CancelPayoutChange',
    title: 'Cancel the pending payout change',
    body: 'One officer approves; the attester cancels it on-chain.',
    unavailable: (p) => (p.payoutChangeLandsAt ? null : 'No payout change is pending.'),
  },
  {
    action: 'CancelRotation',
    title: 'Cancel the pending key rotation',
    body: 'One officer approves; the attester cancels it on-chain.',
    unavailable: (p) => (p.rotationLandsAt ? null : 'No controller rotation is pending.'),
  },
]

function addressError(option: Option, value: string, payee: PayeeSnapshot): string | null {
  if (!option.needsAddress) return null
  const problem = addressProblem(value)
  if (problem) return problem
  const current = option.action === 'PayoutChange' ? payee.payout : payee.controller
  if (current && getAddress(value.trim()) === current) return 'That is already the current address.'
  return null
}

interface OptionListProps {
  readonly payee: PayeeSnapshot
  readonly selected: IntentAction
  readonly onSelect: (action: IntentAction) => void
}

function OptionList({ payee, selected, onSelect }: OptionListProps) {
  return (
    <fieldset className="picker__options">
      <legend className="field__label">What should change?</legend>
      {OPTIONS.map((item) => {
        const blocked = item.unavailable?.(payee) ?? null
        return (
          <label key={item.action} className={blocked ? 'picker__option is-blocked' : 'picker__option'}>
            <input
              type="radio"
              name="action"
              value={item.action}
              checked={selected === item.action}
              disabled={Boolean(blocked)}
              onChange={() => onSelect(item.action)}
            />
            <span className="picker__text">
              <span className="picker__title">{item.title}</span>
              <span className="picker__body">{blocked ?? item.body}</span>
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

interface ActionPickerProps {
  readonly payee: PayeeSnapshot
  readonly busy: boolean
  readonly onOpen: (request: IntentRequest) => void
}

export function ActionPicker({ payee, busy, onOpen }: ActionPickerProps) {
  const [selected, setSelected] = useState<IntentAction>('PayoutChange')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const option = OPTIONS.find((item) => item.action === selected) ?? OPTIONS[0]!

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const problem = addressError(option, address, payee)
    setError(problem)
    if (problem) return
    const newAddress = option.needsAddress ? getAddress(address.trim()) : undefined
    onOpen({ tNumber: payee.tNumber.display, action: selected, newAddress })
  }

  return (
    <form className="picker" onSubmit={submit} noValidate>
      <OptionList payee={payee} selected={selected} onSelect={setSelected} />
      {option.needsAddress ? (
        <TextField
          label={option.needsAddress}
          mono
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="0x…"
          error={error}
          autoComplete="off"
          spellCheck={false}
        />
      ) : null}
      <div className="form-actions">
        <Button type="submit" size="lg" busy={busy}>
          Open approval request
        </Button>
      </div>
    </form>
  )
}

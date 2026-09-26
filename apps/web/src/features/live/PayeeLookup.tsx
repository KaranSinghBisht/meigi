import { useId, useState, type FormEvent } from 'react'
import { Address } from '../../ui/components/Address'
import { Badge } from '../../ui/components/Badge'
import { Button } from '../../ui/components/Button'
import '../../ui/components/field.css'
import { useResolver, type ResolveFailure, type ResolveState } from '../landing/resolve/useResolver'
import './payee-lookup.css'

const FAILURE_TEXT: Record<ResolveFailure, string> = {
  network: "Couldn't reach Sepolia. Try again in a moment.",
  ens: "ENS didn't give a usable answer for this name. Try again in a moment.",
  load: "Couldn't load the lookup. Refresh the page and try again.",
}

const PENDING_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** An active payee: the name and the one payout ENS publishes, and a queued change only as a date. */
function Active({ state }: { readonly state: Extract<ResolveState, { status: 'active' }> }) {
  return (
    <div className="payee-lookup__card">
      <p className="payee-lookup__name">
        <span className="jp" lang="ja">
          {state.payee.legalName}
        </span>
        <Badge tone="active">Active</Badge>
      </p>
      <p className="payee-lookup__pays">
        Pays <Address value={state.payee.payout} />
      </p>
      <p className="payee-lookup__note">{state.target.ens} · via ENS</p>
      {state.payee.changePendingUntil ? (
        <p className="payee-lookup__note">
          Payout change pending until {PENDING_FORMAT.format(state.payee.changePendingUntil)}.
        </p>
      ) : null}
    </div>
  )
}

/** What ENS publishes for the T-number: the name and payout while active, only the status while disputed. */
function LookupResult({ state, errorId }: { readonly state: ResolveState; readonly errorId: string }) {
  switch (state.status) {
    case 'idle':
      return null
    case 'invalid':
      return (
        <p id={errorId} className="payee-lookup__note payee-lookup__note--error">
          Use T followed by 13 digits, like T2011001234567.
        </p>
      )
    case 'loading':
      return <p className="payee-lookup__note">Resolving {state.target.ens}…</p>
    case 'active':
      return <Active state={state} />
    case 'disputed':
      return (
        <div className="payee-lookup__card">
          <p className="payee-lookup__name">
            <Badge tone="disputed">Disputed</Badge> Payments frozen
          </p>
          <p className="payee-lookup__note">{state.target.ens} resolves to no address while the dispute is open.</p>
        </div>
      )
    case 'missing':
      return (
        <p className="payee-lookup__note">
          <strong>Not registered.</strong> {state.target.ens} resolves to no address.
        </p>
      )
    case 'error':
      return <p className="payee-lookup__note payee-lookup__note--error">{FAILURE_TEXT[state.reason]}</p>
  }
}

/**
 * "Check a payee": a T-number in, what a standard ENS client sees for t<digits>.payee.eth out (stock viem through
 * Sepolia's Universal Resolver). Self-contained, so it can sit in any section; the parent sets its width.
 */
export function PayeeLookup({ label = 'Check a payee' }: { readonly label?: string }) {
  const { state, resolve } = useResolver()
  const [value, setValue] = useState('')
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void resolve(value)
  }
  return (
    <form className="payee-lookup" onSubmit={submit} noValidate>
      <label className="payee-lookup__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="payee-lookup__row">
        <input
          id={inputId}
          className="input input--mono"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="T2011001234567"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          aria-describedby={state.status === 'invalid' ? `${hintId} ${errorId}` : hintId}
          aria-invalid={state.status === 'invalid'}
        />
        <Button type="submit" busy={state.status === 'loading'}>
          Check
        </Button>
      </div>
      <p id={hintId} className="payee-lookup__hint">
        T + 13 digits · resolved through ENS on Sepolia
      </p>
      <div className="payee-lookup__result" aria-live="polite">
        <LookupResult state={state} errorId={errorId} />
      </div>
    </form>
  )
}

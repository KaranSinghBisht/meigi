import type { RegisteredPayee, ResolveFailure, ResolveState } from './useResolver'

const unlockFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const FAILURE_TEXT: Record<ResolveFailure, string> = {
  network: "Couldn't reach Sepolia. Try again in a moment.",
  registry: 'The registry gave an unexpected answer. Check the configured network and address.',
  load: "Couldn't load the resolver. Refresh the page and try again.",
}

function PendingRedirect({ payee }: { readonly payee: RegisteredPayee }) {
  if (!payee.pending) return null
  const { address, effectiveAt } = payee.pending
  const locked = effectiveAt.getTime() > Date.now()
  return (
    <p className="resolve__pending">
      Redirect to <code>{address}</code>{' '}
      {locked ? `is timelocked until ${unlockFormat.format(effectiveAt)}.` : 'may have taken effect. Resolve again.'}
    </p>
  )
}

function Found({ state }: { readonly state: Extract<ResolveState, { status: 'found' }> }) {
  const { payee, target } = state
  const disputed = payee.status === 'disputed'
  return (
    <div className="resolve__card">
      <p className="resolve__name">
        <span className={disputed ? 'resolve__mark resolve__mark--warn' : 'resolve__mark'} aria-hidden="true">
          {disputed ? '!' : '✓'}
        </span>
        <span>{payee.legalName}</span>
        <span className={`resolve__badge resolve__badge--${payee.status}`}>{payee.status}</span>
      </p>
      {disputed && (
        <p className="resolve__frozen">Payouts are frozen while another verified claimant disputes this number.</p>
      )}
      <p className="resolve__caption">{disputed ? 'Last registered payout (frozen)' : 'Pays to'}</p>
      <p className="resolve__address">
        <code>{payee.payout}</code>
      </p>
      <p className="resolve__meta">{target.ens}</p>
      <PendingRedirect payee={payee} />
    </div>
  )
}

interface ResolveResultProps {
  readonly state: ResolveState
  /** id of the validation message, referenced by the input's aria-describedby */
  readonly errorId: string
}

/** Everything the popover says after a submit; lives in a polite live region. */
export function ResolveResult({ state, errorId }: ResolveResultProps) {
  switch (state.status) {
    case 'idle':
      return null
    case 'invalid':
      return (
        <p id={errorId} className="resolve__note resolve__note--error">
          Use T followed by 13 digits, like T2011001234567.
        </p>
      )
    case 'undeployed':
      return (
        <p className="resolve__note">
          The registry isn't deployed yet, so {state.target.ens} can't be resolved. It goes live with the Sepolia
          deployment.
        </p>
      )
    case 'loading':
      return <p className="resolve__note">Resolving {state.target.ens}…</p>
    case 'found':
      return <Found state={state} />
    case 'missing':
      return (
        <p className="resolve__note resolve__note--missing">
          <strong>Not registered.</strong> No payout address is bound to {state.target.display}.
        </p>
      )
    case 'error':
      return <p className="resolve__note resolve__note--error">{FAILURE_TEXT[state.reason]}</p>
  }
}

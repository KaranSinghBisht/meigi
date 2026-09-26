import type { ActivePayee, ResolveFailure, ResolveState } from './useResolver'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
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

/** A queued payout change is announced by date only; its address is never shown. */
function PendingChange({ until }: { readonly until: Date | null }) {
  if (!until) return null
  return <p className="resolve__pending">Payout change pending until {dateFormat.format(until)}.</p>
}

function Active({ payee, ens }: { readonly payee: ActivePayee; readonly ens: string }) {
  return (
    <div className="resolve__card">
      <p className="resolve__name">
        <span className="resolve__mark" aria-hidden="true">
          ✓
        </span>
        <span>{payee.legalName}</span>
        <span className="resolve__badge">active</span>
      </p>
      <p className="resolve__caption">Pays to</p>
      <p className="resolve__address">
        <code>{payee.payout}</code>
      </p>
      <p className="resolve__meta">{ens}</p>
      <PendingChange until={payee.changePendingUntil} />
    </div>
  )
}

function Disputed({ ens, until }: { readonly ens: string; readonly until: Date | null }) {
  return (
    <div className="resolve__card">
      <p className="resolve__name">
        <span className="resolve__mark resolve__mark--warn" aria-hidden="true">
          !
        </span>
        <span>Disputed: payments frozen</span>
      </p>
      <p className="resolve__meta">{ens}</p>
      <PendingChange until={until} />
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
    case 'active':
      return <Active payee={state.payee} ens={state.target.ens} />
    case 'disputed':
      return <Disputed ens={state.target.ens} until={state.changePendingUntil} />
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

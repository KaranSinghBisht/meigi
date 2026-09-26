import type { ActivePayee, ResolveFailure, ResolveState } from './useResolver'

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const FAILURE_TEXT: Record<ResolveFailure, string> = {
  network: "Couldn't reach Sepolia. Try again in a moment.",
  ens: "ENS didn't give a usable answer for this name. Try again in a moment.",
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
        <span className="resolve__legal" lang="ja">
          {payee.legalName}
        </span>
        <span className="resolve__badge">active</span>
      </p>
      <p className="resolve__caption">Pays to</p>
      <p className="resolve__address">
        <code>{payee.payout}</code>
      </p>
      <p className="resolve__meta">{ens} · via ENS</p>
      <PendingChange until={payee.changePendingUntil} />
    </div>
  )
}

/** ENS publishes only the status of a disputed payee: neither claimant's name, and no address. */
function Disputed({ ens }: { readonly ens: string }) {
  return (
    <div className="resolve__card">
      <p className="resolve__name">
        <span className="resolve__mark resolve__mark--warn" aria-hidden="true">
          !
        </span>
        <span>Disputed: payments frozen</span>
      </p>
      <p className="resolve__meta">{ens} resolves to no address while the dispute is open.</p>
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
    case 'loading':
      return <p className="resolve__note">Resolving {state.target.ens}…</p>
    case 'active':
      return <Active payee={state.payee} ens={state.target.ens} />
    case 'disputed':
      return <Disputed ens={state.target.ens} />
    case 'missing':
      return (
        <p className="resolve__note resolve__note--missing">
          <strong>Not registered.</strong> {state.target.ens} resolves to no address: nothing is bound to{' '}
          {state.target.display}.
        </p>
      )
    case 'error':
      return <p className="resolve__note resolve__note--error">{FAILURE_TEXT[state.reason]}</p>
  }
}

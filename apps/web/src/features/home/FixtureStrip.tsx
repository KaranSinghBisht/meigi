import { Link } from 'react-router'
import { shortAddress } from '../../lib/chain/format'
import type { PayeeSnapshot } from '../../lib/chain/registry'
import { FIXTURE_T_NUMBER } from '../../lib/chain/tNumber'
import { Spinner } from '../../ui/components/Spinner'
import { usePayee } from '../registry/usePayee'
import './home.css'

/** The registered name; a disputed payee's name is withheld, so only its status is shown. */
function FixtureName({ payee }: { readonly payee: PayeeSnapshot }) {
  if (payee.status === 'disputed') return <span>name withheld while disputed</span>
  if (!payee.legalName) return <span>not registered</span>
  return (
    <span className="jp" lang="ja">
      {payee.legalName}
    </span>
  )
}

/** A live read of the fixture payee, so the first screen already shows the chain answering. */
export function FixtureStrip() {
  const { state } = usePayee(FIXTURE_T_NUMBER)
  return (
    <div className="strip" aria-live="polite">
      <span className="strip__live">
        <span className="strip__dot" aria-hidden="true" /> Live on Sepolia
      </span>
      {state.status === 'loading' || state.status === 'idle' ? (
        <span className="strip__text">
          <Spinner /> Reading the registry…
        </span>
      ) : null}
      {state.status === 'error' ? <span className="strip__text">Couldn't reach the Sepolia RPC just now.</span> : null}
      {state.status === 'ready' ? (
        <span className="strip__text">
          <span className="mono">{FIXTURE_T_NUMBER}</span>
          <span aria-hidden="true">=</span>
          <FixtureName payee={state.payee} />
          {state.payee.payout ? (
            <>
              <span className="strip__pays">pays</span>
              <span className="mono">{shortAddress(state.payee.payout)}</span>
            </>
          ) : null}
        </span>
      ) : null}
      <Link to={`/registry/${FIXTURE_T_NUMBER}`} className="strip__link">
        Open in registry →
      </Link>
    </div>
  )
}

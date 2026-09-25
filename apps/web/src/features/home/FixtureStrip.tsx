import { Link } from 'react-router'
import { shortAddress } from '../../lib/chain/format'
import { FIXTURE_T_NUMBER } from '../../lib/chain/tNumber'
import { Spinner } from '../../ui/components/Spinner'
import { usePayee } from '../registry/usePayee'
import './home.css'

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
          <span className="jp" lang="ja">
            {state.payee.legalName || 'not registered'}
          </span>
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

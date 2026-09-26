import { useNavigate, useParams } from 'react-router'
import { parseTNumber } from '../../lib/chain/tNumber'
import { Notice } from '../../ui/components/Notice'
import { Panel } from '../../ui/components/Panel'
import { Spinner } from '../../ui/components/Spinner'
import { EventFeed } from './EventFeed'
import { PayeeCard } from './PayeeCard'
import { StaleNote } from './StaleNote'
import { TNumberSearch } from './TNumberSearch'
import { usePayee } from './usePayee'
import { useRegistryFeed, type RegistryFeed } from './useRegistryFeed'
import '../../ui/layout/layout.css'
import './registry.css'

function Directory({ feed, current }: { readonly feed: RegistryFeed; readonly current: string | null }) {
  const navigate = useNavigate()
  const entries = [...feed.directory.entries()]
  if (entries.length === 0) return null
  return (
    <div className="directory">
      <p className="eyebrow">Registered on Sepolia</p>
      <ul className="directory__list">
        {entries.map(([tNumber, name]) => (
          <li key={tNumber}>
            <button
              type="button"
              className="directory__chip"
              aria-pressed={tNumber === current}
              title={name}
              onClick={() => navigate(`/registry/${tNumber}`)}
            >
              <span className="jp directory__name" lang="ja">
                {name}
              </span>
              <span className="mono directory__t">{tNumber}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PayeeSlot({ tNumber }: { readonly tNumber: string | null }) {
  const { state, refresh } = usePayee(tNumber)
  if (state.status === 'idle') {
    return <p className="payee-slot__hint">Search a T-number, or pick a registered company above.</p>
  }
  if (state.status === 'loading') {
    return (
      <p className="payee-slot__loading">
        <Spinner /> Reading the registry on Sepolia…
      </p>
    )
  }
  if (state.status === 'error') return <Notice tone="danger" title={state.message} />
  return (
    <>
      <StaleNote message={state.staleError} readAt={state.payee.readAt} />
      <PayeeCard payee={state.payee} onElapsed={refresh} />
    </>
  )
}

function FeedPanel({ feed }: { readonly feed: RegistryFeed }) {
  const stale = Boolean(feed.error)
  const live = (
    <span className={stale ? 'live live--stale' : 'live'}>
      <span className="live__dot" aria-hidden="true" />
      {feed.lastBlock !== null ? `block ${feed.lastBlock.toLocaleString('en-US')}` : 'connecting'}
    </span>
  )
  return (
    <Panel title="Live registry events" eyebrow="PayeeRegistry · Sepolia" actions={live} className="feed-panel">
      {feed.status === 'loading' ? (
        <p className="payee-slot__loading">
          <Spinner /> Scanning logs since block {feed.lastBlock?.toString() ?? 'deployment'}…
        </p>
      ) : null}
      {feed.error ? <Notice tone="warn" title="The event feed can't reach the RPC right now." /> : null}
      {feed.status !== 'loading' ? (
        <EventFeed events={feed.events} times={feed.times} directory={feed.directory} />
      ) : null}
    </Panel>
  )
}

export default function RegistryPage() {
  const params = useParams()
  const navigate = useNavigate()
  const feed = useRegistryFeed()
  const parsed = params.tNumber ? parseTNumber(params.tNumber) : null
  const current = parsed?.display ?? null
  const invalid = Boolean(params.tNumber) && !parsed

  return (
    <div className="registry">
      <header className="page-head">
        <p className="eyebrow">Registry explorer</p>
        <h1 className="page-head__title">
          Who does this <span className="nowrap">T-number</span> pay?
        </h1>
        <p className="page-head__lede">
          Every payee lives on-chain: the company's registered name, the one address it can be paid at, and any change
          that is waiting out its public timelock.
        </p>
      </header>
      <div className="registry__grid">
        <Panel className="registry__lookup" aria-label="Look up a payee">
          <TNumberSearch initial={current ?? ''} onSubmit={(t) => navigate(`/registry/${t.display}`)} />
          <Directory feed={feed} current={current} />
          <div className="payee-slot">
            {invalid ? (
              <Notice tone="danger" title={`"${params.tNumber}" is not a T-number.`}>
                <p>Use "T" followed by 13 digits.</p>
              </Notice>
            ) : (
              <PayeeSlot tNumber={current} />
            )}
          </div>
        </Panel>
        <FeedPanel feed={feed} />
      </div>
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { FeedEvent, FeedEventName } from '../../lib/chain/events'
import { formatJst, formatRelative, shortAddress } from '../../lib/chain/format'
import { TxLink } from '../../ui/components/Address'
import './feed.css'

type Tone = 'jade' | 'amber' | 'iris' | 'seal' | 'plain'

const LABELS: Record<FeedEventName, { label: string; tone: Tone }> = {
  PayeeRegistered: { label: 'Registered', tone: 'jade' },
  PayoutChangeRequested: { label: 'Payout change requested', tone: 'amber' },
  PayoutChangeCancelled: { label: 'Payout change cancelled', tone: 'plain' },
  PayoutChanged: { label: 'Payout changed', tone: 'iris' },
  ControllerRotationRequested: { label: 'Key rotation requested', tone: 'amber' },
  ControllerRotationCancelled: { label: 'Key rotation cancelled', tone: 'plain' },
  ControllerRotated: { label: 'Controller rotated', tone: 'iris' },
  ClaimDisputed: { label: 'Second claim: disputed', tone: 'seal' },
  DisputeResolutionQueued: { label: 'Dispute resolution queued', tone: 'amber' },
  DisputeResolved: { label: 'Dispute resolved', tone: 'jade' },
  DisputeDismissed: { label: 'Dispute dismissed', tone: 'jade' },
  OfficersUpdated: { label: 'Officers updated', tone: 'plain' },
}

function Addr({ value }: { readonly value: string }) {
  return (
    <span className="mono" title={value}>
      {shortAddress(value)}
    </span>
  )
}

/** One line of safe detail per event. Queued addresses were already dropped in lib/chain/events. */
function detail(event: FeedEvent): ReactNode {
  switch (event.name) {
    case 'PayeeRegistered':
    case 'DisputeResolved':
      return event.payout ? (
        <>
          pays <Addr value={event.payout} />
        </>
      ) : null
    case 'PayoutChangeRequested':
    case 'ControllerRotationRequested':
    case 'DisputeResolutionQueued':
      return event.landsAt ? `lands ${formatJst(event.landsAt)}; the new address isn't shown until then` : null
    case 'PayoutChangeCancelled':
    case 'ControllerRotationCancelled':
      return event.by ? (
        <>
          cancelled by <Addr value={event.by} />
        </>
      ) : null
    case 'PayoutChanged':
      return event.payout ? (
        <>
          now pays <Addr value={event.payout} />
        </>
      ) : null
    case 'ControllerRotated':
      return event.controller ? (
        <>
          new controller <Addr value={event.controller} />
        </>
      ) : null
    case 'ClaimDisputed':
      return 'payments frozen until governance resolves it'
    case 'DisputeDismissed':
      return 'the claim was dismissed; payments resume'
    case 'OfficersUpdated':
      return event.officers ? `${event.officers.threshold} of ${event.officers.count} officers must approve` : null
  }
}

interface EventFeedProps {
  readonly events: readonly FeedEvent[]
  readonly times: ReadonlyMap<bigint, Date>
  readonly directory: ReadonlyMap<string, string>
  readonly limit?: number
}

export function EventFeed({ events, times, directory, limit = 40 }: EventFeedProps) {
  if (events.length === 0) {
    return <p className="feed__empty">No registry events yet.</p>
  }
  return (
    <ol className="feed">
      {events.slice(0, limit).map((event) => {
        const look = LABELS[event.name]
        const time = times.get(event.blockNumber)
        const line = detail(event)
        const name = directory.get(event.tNumber)
        return (
          <li key={event.id} className={`feed__item feed__item--${look.tone}`}>
            <span className="feed__dot" aria-hidden="true" />
            <div className="feed__main">
              <p className="feed__title">{look.label}</p>
              <p className="feed__who">
                <Link to={`/registry/${event.tNumber}`} className="mono">
                  {event.tNumber}
                </Link>
                {name ? (
                  <span className="jp feed__name" lang="ja">
                    {name}
                  </span>
                ) : null}
              </p>
              {line ? <p className="feed__detail">{line}</p> : null}
            </div>
            <div className="feed__meta">
              {time ? <time dateTime={time.toISOString()}>{formatRelative(time)}</time> : null}
              <TxLink hash={event.txHash} label="tx" />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

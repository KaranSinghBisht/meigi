import { formatJst } from '../../lib/chain/format'
import { Countdown } from '../../ui/components/Countdown'
import './registry.css'

export type PendingKind = 'payout' | 'rotation' | 'dispute'

const COPY: Record<PendingKind, { title: string; body: string }> = {
  payout: {
    title: 'Payout change pending',
    body: 'The new address stays hidden until it lands, so nobody pays it early. Until then the controller, an attester or governance can cancel it.',
  },
  rotation: {
    title: 'Controller rotation pending',
    body: 'The business key is being replaced (lost-key recovery). The current controller can cancel it until it lands.',
  },
  dispute: {
    title: 'Dispute resolution queued',
    body: 'The payee stays frozen until the resolution lands. A new claim restarts it.',
  },
}

interface PendingBannerProps {
  readonly kind: PendingKind
  readonly landsAt: Date
  readonly onElapsed?: () => void
}

/** Loud, on purpose: a pending change is the one thing a payer must never miss. */
export function PendingBanner({ kind, landsAt, onElapsed }: PendingBannerProps) {
  const copy = COPY[kind]
  return (
    <div className="pending" role="status">
      <div className="pending__head">
        <p className="pending__title">{copy.title}</p>
        <p className="pending__clock">
          <span className="pending__lands">lands in</span>
          <Countdown to={landsAt} onElapsed={onElapsed} className="pending__countdown" />
        </p>
      </div>
      <p className="pending__body">
        {copy.body} <span className="pending__when">({formatJst(landsAt)})</span>
      </p>
    </div>
  )
}

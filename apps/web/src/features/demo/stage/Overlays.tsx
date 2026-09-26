// Things that float over the stage: the pointer, the chips that fly from the email into the panel, and the end
// card. All start hidden; the timeline moves and shows them.

import { HankoMark } from '../../../ui/brand/HankoMark'
import { BEC } from '../content/bec'

export function Cursor() {
  return (
    <div className="dcursor" data-d="cursor" data-enter="">
      <span className="dcursor__ripple" data-d="cursor-ripple" />
      <span className="dcursor__arrow" data-d="cursor-arrow">
        <svg viewBox="0 0 20 28" aria-hidden="true">
        <path
          d="M2 2v20.5l5.6-5.2 3.6 8.2 3.4-1.5-3.5-8h7.6L2 2Z"
          fill="#111"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  )
}

const FLIGHTS = [
  { key: 'tNumber', text: BEC.tNumber },
  { key: 'amount', text: BEC.amount },
  { key: 'address', text: BEC.payToShort },
  { key: 'invoice', text: BEC.invoice },
] as const

export function Flights() {
  return (
    <div className="dflights" aria-hidden="true">
      {FLIGHTS.map((flight) => (
        <span key={flight.key} className={`dghost dghost--${flight.key}`} data-d={`ghost-${flight.key}`} data-enter="">
          {flight.text}
        </span>
      ))}
    </div>
  )
}

const LIVE_APP = 'https://meigi.karanbishttt.workers.dev'
const GITHUB = 'https://github.com/KaranSinghBisht/meigi'

export function EndCard() {
  return (
    <div className="dend" data-d="end" data-enter="">
      <section className="dend__card">
        <HankoMark size={56} />
        <h2 className="dend__title">Pay companies, not addresses.</h2>
        <p className="dend__text">
          Meigi binds a company&apos;s official registry number to one payout: verified once, and checked on every
          payment, by people and by agents.
        </p>
        <p className="dend__links">
          <a className="btn btn--primary btn--md" href={LIVE_APP} target="_blank" rel="noreferrer">
            meigi.karanbishttt.workers.dev
          </a>
          <a className="btn btn--ghost btn--md mono" href={`/registry/${BEC.tNumber}`}>
            {BEC.ens}
          </a>
          <a className="btn btn--ghost btn--md" href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </p>
      </section>
    </div>
  )
}

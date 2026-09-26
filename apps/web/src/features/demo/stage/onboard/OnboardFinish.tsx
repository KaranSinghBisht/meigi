// The wizard's last three screens: the record's placeholder officer, the review (the rows /register's summary
// card shows), and the registered payee card.

import { useQr } from '../../../../ui/world/useQr'
import { ONBOARD, ONBOARD_COPY } from '../../content/onboard'
import { Chip } from '../panel/parts'
import { Next, Screen } from './Screen'

export function OfficersScreen() {
  const { title, lede } = ONBOARD_COPY.officers
  return (
    <Screen n={5} title={title} lede={lede}>
      <div className="onb__officer">
        <p className="onb__wallet-label">
          <b>Officer 1</b>
          <span>demo company</span>
        </p>
        <p className="onb__wallet-value">
          <Chip tone="muted">Placeholder officer</Chip>
          <span className="mono">{ONBOARD.officerShort}</span>
        </p>
      </div>
      <Next n={5} />
    </Screen>
  )
}

interface ReviewRow {
  readonly label: string
  readonly value: string
  readonly mono?: boolean
  /** A chip beside the value, as the real summary card shows: "Fictional", "Not proven". */
  readonly chip?: string
}

const REVIEW: readonly ReviewRow[] = [
  { label: 'Company', value: ONBOARD.legalName, chip: 'Fictional' },
  { label: 'T-number', value: ONBOARD.tNumber, mono: true },
  { label: 'Payee name', value: ONBOARD.ens, mono: true },
  { label: 'Payout address', value: ONBOARD.payoutShort, mono: true },
  { label: 'Business key', value: ONBOARD.controllerShort, mono: true },
  { label: 'Domain', value: 'None', chip: 'Not proven' },
  { label: 'Officers', value: `${ONBOARD.officers} placeholder officer` },
]

export function ReviewScreen() {
  const { title, lede } = ONBOARD_COPY.review
  return (
    <Screen n={6} title={title} lede={lede}>
      <dl className="onb__review">
        {REVIEW.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <span className={row.mono ? 'mono' : undefined}>{row.value}</span>
              {row.chip ? <Chip tone="muted">{row.chip}</Chip> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="onb__swap onb__swap--end">
        <span className="btn btn--primary btn--md" data-d="onb-register">
          Register
        </span>
        <span className="onb__wallet-value" data-d="onb-registered" data-enter="">
          <Chip tone="ok">Registered on Sepolia</Chip>
          <span className="mono">{ONBOARD.txShort}</span>
        </span>
      </p>
    </Screen>
  )
}

export function RegisteredScreen() {
  const qr = useQr(ONBOARD.payeeUrl)
  const { title, lede } = ONBOARD_COPY.registered
  return (
    <Screen n={7} title={title} lede={lede}>
      <div className="onb__card" data-d="onb-card">
        <span className="onb__card-qr">
          {qr.src ? <img src={qr.src} alt="" width={112} height={112} /> : null}
          {qr.failed ? <span className="onb__muted">QR unavailable</span> : null}
        </span>
        <div className="onb__card-body">
          <p>
            <Chip tone="info">Registered payee · fictional company</Chip>
          </p>
          <p className="onb__record-name" lang="ja">
            {ONBOARD.legalName}
          </p>
          <p className="mono onb__muted">{ONBOARD.tNumber}</p>
          <p className="onb__card-ens">
            <span className="mono">{ONBOARD.ens}</span> → <span className="mono">{ONBOARD.payoutShort}</span>
          </p>
          <p className="onb__resolves" data-d="onb-resolves" data-enter="">
            ✓ Resolves in any ENS client
          </p>
        </div>
      </div>
    </Screen>
  )
}

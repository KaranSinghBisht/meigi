// The wizard's last three screens, drawn from the recorded registration: its officers, the review (the rows
// /register's summary card shows) and the registered payee. A seeded registration has no Register click: its
// transaction is shown as the record it is.

import { useQr } from '../../../../ui/world/useQr'
import { ONBOARD, ONBOARD_COPY, officersText } from '../../content/onboard'
import { Chip } from '../panel/parts'
import { Next, Screen } from './Screen'

export function OfficersScreen() {
  const { title, lede } = ONBOARD_COPY.officers
  return (
    <Screen n={5} title={title} lede={lede}>
      <ol className="onb__officers">
        {ONBOARD.officers.map((officer, index) => (
          <li
            key={officer.short}
            className="onb__officer"
            data-d={`onb-officer-${index + 1}`}
            data-enter={ONBOARD.seeded ? undefined : ''}
          >
            <b>Officer {index + 1}</b>
            <span className="mono">{officer.short}</span>
            {officer.proof === 'world-id' ? (
              <Chip tone="ok">Verified human</Chip>
            ) : (
              <Chip tone="muted">Placeholder officer</Chip>
            )}
            {officer.sybilScore !== null ? (
              <span className="onb__muted" title="A risk signal from World, not a uniqueness verdict.">
                Selfie Check · sybil score {officer.sybilScore}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {ONBOARD.seeded ? null : <Next n={5} />}
    </Screen>
  )
}

interface ReviewRow {
  readonly label: string
  readonly value: string
  readonly mono?: boolean
  /** A chip beside the value, as the real summary card shows. */
  readonly chip?: string
}

const DOMAIN_PROOF: Readonly<Record<string, string>> = {
  dns: 'Signed DNS record',
  'well-known': 'Signed .well-known file',
  fixture: 'Not proven',
}

const REVIEW: readonly ReviewRow[] = [
  { label: 'Company', value: ONBOARD.legalName, chip: ONBOARD.fixture ? 'Fictional' : 'NTA exact match' },
  { label: 'T-number', value: ONBOARD.tNumber, mono: true },
  { label: 'Payee name', value: ONBOARD.ens, mono: true },
  { label: 'Payout address', value: ONBOARD.payoutShort, mono: true },
  { label: 'Business key', value: ONBOARD.controllerShort, mono: true },
  { label: 'Domain', value: ONBOARD.domain.name ?? 'None', chip: DOMAIN_PROOF[ONBOARD.domain.method] },
  { label: 'Officers', value: officersText() },
]

function Register() {
  if (ONBOARD.seeded) return null
  return (
    <p className="onb__swap onb__swap--end">
      <span className="btn btn--primary btn--md" data-d="onb-register">
        Register
      </span>
      <span className="onb__wallet-value" data-d="onb-registered" data-enter="">
        <Chip tone="ok">Registered on Sepolia</Chip>
        <span className="mono">{ONBOARD.txShort}</span>
      </span>
    </p>
  )
}

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
      <p className="onb__threshold">
        <span>Approvals needed for each change</span>
        <Chip tone="muted">
          {ONBOARD.threshold} of {Math.max(ONBOARD.officers.length, 1)}
        </Chip>
      </p>
      <Register />
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
            <Chip tone="info">{ONBOARD.fixture ? 'Registered payee · fictional company' : 'Registered payee'}</Chip>
          </p>
          <p className="onb__record-name" lang="ja">
            {ONBOARD.legalName}
          </p>
          <p className="mono onb__muted">{ONBOARD.tNumber}</p>
          <p className="onb__card-ens">
            <span className="mono">{ONBOARD.ens}</span> → <span className="mono">{ONBOARD.payoutShort}</span>
          </p>
          <p className="onb__resolves" data-d="onb-resolves" data-enter="">
            ✓ Resolves on ENS (checked with stock viem)
          </p>
        </div>
      </div>
      <p className="onb__tx">
        Registered on Sepolia in <span className="mono">{ONBOARD.txShort}</span>
      </p>
    </Screen>
  )
}

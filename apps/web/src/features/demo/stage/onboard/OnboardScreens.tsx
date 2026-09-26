// The wizard's six screens, a lightweight replica of /register's. They start hidden (the first excepted) and the
// chapter 0 timeline walks through them; every value they land on is the real registration (content/onboard).

import type { ReactNode } from 'react'
import { useQr } from '../../../../ui/world/useQr'
import { ONBOARD, ONBOARD_STEPS } from '../../content/onboard'
import { Chip, Typed } from '../panel/parts'
import './screens.css'

interface ScreenProps {
  readonly n: number
  readonly title: string
  readonly lede: string
  readonly children: ReactNode
}

function Screen({ n, title, lede, children }: ScreenProps) {
  return (
    <section className="onb__screen" data-d={`onb-screen-${n}`} data-enter={n === 1 ? undefined : ''}>
      <p className="onb__eyebrow">
        Step {n} of {ONBOARD_STEPS.length}
      </p>
      <h3 className="onb__title">{title}</h3>
      <p className="onb__lede">{lede}</p>
      {children}
    </section>
  )
}

function Next({ n, label = 'Continue' }: { readonly n: number; readonly label?: string }) {
  return (
    <span className="btn btn--primary btn--md onb__next" data-d={`onb-next-${n}`}>
      {label}
    </span>
  )
}

export function CompanyScreen() {
  return (
    <Screen n={1} title="Which company is joining?" lede="Enter its T-number. Meigi fills in the rest from the registry.">
      <p className="onb__label">T-number or LEI</p>
      <p className="onb__input" data-d="onb-input">
        <Typed name="onb-tnumber" text={ONBOARD.tNumber} className="mono" />
      </p>
      <p className="onb__payee">
        <span>Your payee name</span>
        <Typed name="onb-ens" text={ONBOARD.ens} className="mono" />
      </p>
      <div className="onb__record" data-d="onb-record" data-enter="">
        <Chip tone="info">Fictional demo company</Chip>
        <p className="onb__record-name" lang="ja">
          {ONBOARD.legalName}
        </p>
      </div>
      <Next n={1} />
    </Screen>
  )
}

interface WalletProps {
  readonly label: string
  readonly note: string
  readonly action: string
  readonly name: string
  readonly value: string
  readonly status: string
}

function Wallet({ label, note, action, name, value, status }: WalletProps) {
  return (
    <div className="onb__wallet">
      <p className="onb__wallet-label">
        <b>{label}</b>
        <span>{note}</span>
      </p>
      <p className="onb__swap">
        <span className="btn btn--ghost btn--sm" data-d={`${name}-action`}>
          {action}
        </span>
        <span className="onb__wallet-value" data-d={name} data-enter="">
          <Chip tone="ok">{status}</Chip>
          <span className="mono">{value}</span>
        </span>
      </p>
    </div>
  )
}

export function WalletsScreen() {
  return (
    <Screen n={2} title="Which wallets will it use?" lede="One key controls the record; a separate wallet only receives.">
      <Wallet
        label="Business wallet"
        note="controls this record"
        action="Connect wallet"
        name="onb-controller"
        value={ONBOARD.controllerShort}
        status="Connected"
      />
      <Wallet
        label="Payout wallet"
        note="receives payments"
        action="Create a new payout wallet"
        name="onb-payout"
        value={ONBOARD.payoutShort}
        status="Created"
      />
      <Next n={2} />
    </Screen>
  )
}

export function DomainScreen() {
  return (
    <Screen n={3} title="Prove you control your domain" lede="Publish one TXT record, signed by the business wallet.">
      <p className="onb__payee">
        <span>Domain</span>
        <b className="mono">{ONBOARD.domain}</b>
      </p>
      <dl className="onb__txt">
        <dt>TXT name</dt>
        <dd className="mono">_meigi.{ONBOARD.domain}</dd>
        <dt>Value</dt>
        <dd className="mono">
          meigi-sig=<span className="onb__blur">0x••••••••••••••••••••</span>
        </dd>
      </dl>
      <p className="onb__swap">
        <span className="btn btn--ghost btn--sm" data-d="onb-domain-action">
          Check the record
        </span>
        <span className="onb__wallet-value" data-d="onb-domain" data-enter="">
          <Chip tone="ok">Domain proven</Chip>
        </span>
      </p>
      <Next n={3} />
    </Screen>
  )
}

export function OfficersScreen() {
  const qr = useQr('https://world.org/verify')
  return (
    <Screen n={4} title="Who approves changes?" lede="Each officer proves they’re a unique human with World ID.">
      <div className="onb__officer">
        <span className="onb__qr">
          {qr.src ? <img src={qr.src} alt="" width={104} height={104} /> : null}
          <span className="onb__qr-ok" data-d="onb-qr-ok" data-enter="">
            ✓
          </span>
        </span>
        <div className="onb__officer-body">
          <p className="onb__wallet-label">
            <b>Officer 1</b>
            <span>World ID</span>
          </p>
          <p className="onb__swap">
            <span className="onb__muted" data-d="onb-officer-wait">
              Scan with World App
            </span>
            <span className="onb__wallet-value" data-d="onb-officer" data-enter="">
              <Chip tone="ok">Verified human</Chip>
              <span className="mono">{ONBOARD.officerShort}</span>
            </span>
          </p>
        </div>
      </div>
      <Next n={4} />
    </Screen>
  )
}

const REVIEW: readonly (readonly [string, string, boolean])[] = [
  ['Company', `${ONBOARD.legalName} · ${ONBOARD.tNumber}`, false],
  ['Payee name', ONBOARD.ens, true],
  ['Business wallet', ONBOARD.controllerShort, true],
  ['Payout', ONBOARD.payoutShort, true],
  ['Domain', `${ONBOARD.domain} · proven`, false],
  ['Officers', `${ONBOARD.officers} · World ID`, false],
]

export function ReviewScreen() {
  return (
    <Screen n={5} title="Review and register" lede="One transaction on Sepolia. Anyone can read it; only you can change it.">
      <dl className="onb__review">
        {REVIEW.map(([label, value, mono]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className={mono ? 'mono' : undefined}>{value}</dd>
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

export function VerifiedScreen() {
  const qr = useQr(ONBOARD.payeeUrl)
  return (
    <Screen n={6} title="You’re verified." lede="Customers, and their agents, can now pay this company by name.">
      <div className="onb__card" data-d="onb-card">
        <span className="onb__card-qr">{qr.src ? <img src={qr.src} alt="" width={112} height={112} /> : null}</span>
        <div className="onb__card-body">
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

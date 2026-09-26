// The wizard's first four screens, a lightweight replica of /register's (its copy is shared verbatim through
// content/onboard). They start hidden (the first excepted) and the chapter 0 timeline walks through them; every
// value they land on is the real registration.

import { ONBOARD, ONBOARD_COPY, REPRESENTATION_METHODS } from '../../content/onboard'
import { Chip, Typed } from '../panel/parts'
import { Next, Screen } from './Screen'
import './screens.css'

export function CompanyScreen() {
  const { title, lede } = ONBOARD_COPY.company
  return (
    <Screen n={1} title={title} lede={lede}>
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
  const { title, lede } = ONBOARD_COPY.wallets
  return (
    <Screen n={2} title={title} lede={lede}>
      <Wallet
        label="Business key"
        note="approves changes"
        action="Connect wallet"
        name="onb-controller"
        value={ONBOARD.controllerShort}
        status="Connected"
      />
      <Wallet
        label="Payout address"
        note="every payment goes here"
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
  const { title, lede } = ONBOARD_COPY.domain
  return (
    <Screen n={3} title={title} lede={lede}>
      <p className="onb__skip">
        <Chip tone="muted">Demo companies skip this step</Chip>
      </p>
      <Next n={3} />
    </Screen>
  )
}

/** Not built for anyone yet: both ways are shown disabled, and the note says this demo company proves none of it. */
export function RepresentationScreen() {
  const { title, lede } = ONBOARD_COPY.representative
  return (
    <Screen n={4} title={title} lede={lede}>
      <p className="onb__skip">
        <Chip tone="muted">Demo companies skip this step</Chip>
      </p>
      <ul className="onb__methods">
        {REPRESENTATION_METHODS.map((method) => (
          <li key={method.id} className="onb__method">
            <b className="onb__method-title">{method.title}</b>
            <span className="onb__method-body">{method.body}</span>
            <Chip tone="muted">Coming in production</Chip>
          </li>
        ))}
      </ul>
      <p className="onb__note">
        <b>{ONBOARD_COPY.representativeDemo.title}</b> <span>{ONBOARD_COPY.representativeDemo.detail}</span>
      </p>
      <Next n={4} />
    </Screen>
  )
}

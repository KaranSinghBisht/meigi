// The wizard's first four screens, drawn as /register's replay draws them, from the recorded registration. A seeded
// registration shows no clicks (nothing was typed, connected or created); a real run through the wizard does, and
// the chapter 0 timeline plays them.

import { ONBOARD, ONBOARD_COPY, PAYOUT_CHOICE, REPRESENTATION_METHODS } from '../../content/onboard'
import { Chip, Typed } from '../panel/parts'
import { Next, Screen } from './Screen'
import './screens.css'

/** A seeded run is drawn as the record; a wizard run starts empty and the timeline brings each value in. */
const enter = ONBOARD.seeded ? undefined : ''

function CompanyCard() {
  if (ONBOARD.seeded || ONBOARD.fixture) {
    return (
      <div className="onb__record" data-d="onb-record" data-enter={enter}>
        <Chip tone="info">{ONBOARD.seeded ? 'Demo company' : 'Fictional demo company'}</Chip>
        <p className="onb__record-name" lang="ja">
          {ONBOARD.legalName}
        </p>
        {ONBOARD.note ? <p className="onb__record-note">{ONBOARD.note}</p> : null}
      </div>
    )
  }
  return (
    <div className="onb__record" data-d="onb-record" data-enter={enter}>
      <Chip tone="ok">Found in the NTA registry</Chip>
      <p className="onb__record-name" lang="ja">
        {ONBOARD.legalName}
      </p>
      {ONBOARD.address ? <p className="onb__record-note">{ONBOARD.address}</p> : null}
    </div>
  )
}

export function CompanyScreen() {
  const { title, lede } = ONBOARD_COPY.company
  return (
    <Screen n={1} title={title} lede={lede}>
      <p className="onb__label">T-number or LEI</p>
      <p className="onb__input" data-d="onb-input">
        {ONBOARD.seeded ? (
          <span className="mono">{ONBOARD.query}</span>
        ) : (
          <Typed name="onb-tnumber" text={ONBOARD.query} className="mono" />
        )}
      </p>
      <p className="onb__payee">
        <span>Your payee name</span>
        {ONBOARD.seeded ? <span className="mono">{ONBOARD.ens}</span> : <Typed name="onb-ens" text={ONBOARD.ens} className="mono" />}
      </p>
      <CompanyCard />
      {ONBOARD.seeded ? null : <Next n={1} />}
    </Screen>
  )
}

interface WalletProps {
  readonly title: string
  readonly lede: string
  readonly name: string
  /** The wizard's button for this wallet; null for a seeded registration, where nothing was pressed. */
  readonly action: string | null
  readonly chips: readonly string[]
  readonly value: string
}

function Wallet({ title, lede, name, action, chips, value }: WalletProps) {
  return (
    <div className="onb__wallet">
      <p className="onb__wallet-label">
        <b>{title}</b>
      </p>
      <p className="onb__wallet-lede">{lede}</p>
      <p className="onb__swap">
        {action ? (
          <span className="btn btn--ghost btn--sm" data-d={`${name}-action`}>
            {action}
          </span>
        ) : null}
        <span className="onb__wallet-value" data-d={name} data-enter={action ? '' : undefined}>
          <span className="mono">{value}</span>
          {chips.map((chip) => (
            <Chip key={chip} tone={action ? 'ok' : 'muted'}>
              {chip}
            </Chip>
          ))}
        </span>
      </p>
    </div>
  )
}

/** A seeded registration connected and created nothing: both addresses are shown as the registry holds them. */
export function WalletsScreen() {
  const copy = ONBOARD_COPY.wallets
  const mode = ONBOARD.payoutMode
  const payoutChips = ONBOARD.seeded ? ['Registered payout'] : mode === 'create' ? ['Testnet demo wallet', 'Backup saved'] : []
  return (
    <Screen n={2} title={copy.title} lede={copy.lede}>
      <Wallet
        title="Business key"
        lede={copy.keyLede}
        name="onb-controller"
        action={ONBOARD.seeded ? null : 'Connect wallet'}
        chips={[ONBOARD.seeded ? 'Registered business key' : 'Connected']}
        value={ONBOARD.controllerShort}
      />
      <Wallet
        title="Payout address"
        lede={copy.payoutLede}
        name="onb-payout"
        action={ONBOARD.seeded || !mode ? null : PAYOUT_CHOICE[mode]}
        chips={payoutChips}
        value={ONBOARD.payoutShort}
      />
      {ONBOARD.seeded ? null : <Next n={2} />}
    </Screen>
  )
}

export function DomainScreen() {
  const { title, lede, notice } = ONBOARD_COPY.domain
  return (
    <Screen n={3} title={title} lede={lede}>
      {notice ? <p className="onb__note">{notice}</p> : null}
      {ONBOARD.seeded ? null : <Next n={3} />}
    </Screen>
  )
}

/** Not built for anyone yet: both ways are shown disabled, and the note says what registration proves. */
export function RepresentationScreen() {
  const { title, lede } = ONBOARD_COPY.representative
  const note = ONBOARD_COPY.representativeNote
  return (
    <Screen n={4} title={title} lede={lede}>
      {ONBOARD.fixture ? (
        <p className="onb__skip">
          <Chip tone="muted">Demo companies skip this step</Chip>
        </p>
      ) : null}
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
        <b>{note.title}</b> <span>{note.detail}</span>
      </p>
      {ONBOARD.seeded ? null : <Next n={4} />}
    </Screen>
  )
}

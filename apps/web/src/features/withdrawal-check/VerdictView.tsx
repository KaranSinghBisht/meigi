import type { ReactNode } from 'react'
import { formatJst } from '../../lib/chain/format'
import { Address } from '../../ui/components/Address'
import { Badge, type BadgeTone } from '../../ui/components/Badge'
import { Countdown } from '../../ui/components/Countdown'
import type { IssuedEnsName } from '../landing/lib/ens'
import type { Destination, MismatchReason, Verdict } from './checkWithdrawal'

const WHY: Record<MismatchReason, string> = {
  different: 'The registry and ENS both name the registered payout, and this is a different address.',
  unresolved: "The name the customer gave doesn't resolve to an address.",
  ens: "ENS doesn't agree with the registry right now. Hold, and check the payee before anything else.",
}

/** Who an issued name was issued to, by its ENSIP-27 class. A Map, since the class is text any company can set. */
const ISSUED_TO = new Map([['Agent', 'to its agent'], ['Workgroup', 'to one of its teams'], ['Person', 'to a person']])

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="withdrawal__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Name({ children }: { readonly children: string }) {
  return (
    <span className="jp" lang="ja">
      {children}
    </span>
  )
}

interface FrameProps {
  readonly tone: BadgeTone
  readonly chip: string
  readonly lead: ReactNode
  readonly children?: ReactNode
}

/** One status chip, one sentence saying what to do, then the facts behind it. */
/** "A name 株式会社メイギ商事 issued to its agent. It isn't a payee and has no address." */
function IssuedWhy({ issued }: { readonly issued: IssuedEnsName }) {
  const to = issued.nameClass ? ISSUED_TO.get(issued.nameClass) : undefined
  return (
    <>
      A name {issued.company ? <Name>{issued.company}</Name> : <span className="mono nowrap">{issued.tNumber}</span>}{' '}
      issued{to ? ` ${to}` : ''}. It isn&apos;t a payee and has no address.
    </>
  )
}

function Frame({ tone, chip, lead, children }: FrameProps) {
  return (
    <div className="withdrawal__verdict">
      <p className="withdrawal__lead">
        <Badge tone={tone}>{chip}</Badge>
        <span>{lead}</span>
      </p>
      {children ? <dl className="withdrawal__facts">{children}</dl> : null}
    </div>
  )
}

function asked(destination: Destination, address: string | null): ReactNode {
  if (destination.kind === 'address') return <Address value={destination.address} link={false} />
  if (!address) return <span className="mono">{destination.name}</span>
  return (
    <>
      <span className="mono nowrap">{destination.name}</span> → <Address value={address} link={false} />
    </>
  )
}

function Match({ verdict }: { readonly verdict: Extract<Verdict, { kind: 'match' }> }) {
  return (
    <Frame tone="active" chip="Match" lead={<>Release. This is the registered payout of <Name>{verdict.legalName}</Name>.</>}>
      <Row label="Record with the withdrawal">
        <Name>{verdict.legalName}</Name> · <span className="mono nowrap">{verdict.target.display}</span>
      </Row>
      <Row label="Registered payout">
        <Address value={verdict.payout} />
      </Row>
      <Row label="ENS agrees">
        <span className="mono nowrap">{verdict.target.ens}</span> resolves to the same address
      </Row>
    </Frame>
  )
}

interface MismatchProps {
  readonly verdict: Extract<Verdict, { kind: 'mismatch' }>
  readonly destination: Destination
}

function Mismatch({ verdict, destination }: MismatchProps) {
  return (
    <Frame tone="disputed" chip="No match" lead={<>Hold. This isn&apos;t the registered payout of <Name>{verdict.legalName}</Name>.</>}>
      <Row label="The customer asked for">{asked(destination, verdict.asked)}</Row>
      <Row label="Registered payout">
        <Address value={verdict.payout} />
      </Row>
      <Row label="Its ENS name">
        <span className="mono nowrap">{verdict.target.ens}</span>
      </Row>
      <Row label="Why">{verdict.issued ? <IssuedWhy issued={verdict.issued} /> : WHY[verdict.reason]}</Row>
    </Frame>
  )
}

/** The verdict, as an exchange operator reads it: release or hold, and why. */
export function VerdictView({ verdict, destination }: { readonly verdict: Verdict; readonly destination: Destination }) {
  switch (verdict.kind) {
    case 'match':
      return <Match verdict={verdict} />
    case 'mismatch':
      return <Mismatch verdict={verdict} destination={destination} />
    case 'unregistered':
      return (
        <Frame tone="neutral" chip="Not registered" lead={<>Hold. No payout is registered for <span className="mono nowrap">{verdict.target.display}</span>, so none can be confirmed.</>}>
          <Row label="ENS">
            <span className="mono nowrap">{verdict.target.ens}</span> resolves to no address
          </Row>
        </Frame>
      )
    case 'pending':
      return (
        <Frame tone="pending" chip="Change pending" lead={<>Hold. <Name>{verdict.legalName}</Name> is changing its payout, in public.</>}>
          <Row label="The change lands in">
            <Countdown to={verdict.landsAt} /> <span aria-hidden="true">· {formatJst(verdict.landsAt)}</span>
          </Row>
          <Row label="New address">Not shown until it lands, so nobody pays it early.</Row>
        </Frame>
      )
    case 'disputed':
      return (
        <Frame tone="disputed" chip="Disputed" lead={<>Hold. <span className="mono nowrap">{verdict.target.display}</span> is disputed, and payments to it are frozen.</>}>
          <Row label="ENS">
            <span className="mono nowrap">{verdict.target.ens}</span> resolves to no address while the dispute is open
          </Row>
          {verdict.resolvesAt ? <Row label="Dispute resolves">{formatJst(verdict.resolvesAt)}</Row> : null}
        </Frame>
      )
  }
}

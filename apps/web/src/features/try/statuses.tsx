import type { ReactNode } from 'react'
import { shortAddress } from '../../lib/chain/format'
import { Badge } from '../../ui/components/Badge'
import { Countdown } from '../../ui/components/Countdown'
import { useEnsCheck, usePayee } from '../registry/usePayee'
import { useSettlements } from '../settlements/useSettlements'
import { RECORDED_BEC } from '../agent/recorded'

/** The fixture payee every check starts from: 株式会社メイギ商事 (fictional). */
export const FIXTURE = 'T2011001234567'
/** The company Karan registers live with World ID officers. */
export const BOOTH = 'T7999900000002'

function Status({ chip, children }: { readonly chip: ReactNode; readonly children?: ReactNode }) {
  return (
    <>
      {chip}
      {children ? <span className="try-check__fact">{children}</span> : null}
    </>
  )
}

const Checking = () => <Badge tone="neutral">Checking…</Badge>

/** 1. The registry, read live: who the fixture T-number pays. */
export function RegistryStatus() {
  const { state } = usePayee(FIXTURE)
  if (state.status !== 'ready')
    return <Status chip={state.status === 'error' ? <Badge>Unreachable</Badge> : <Checking />} />
  const { payee } = state
  if (payee.status !== 'active') {
    return (
      <Status chip={<Badge tone="disputed">{payee.status === 'disputed' ? 'Disputed' : 'Not registered'}</Badge>} />
    )
  }
  return (
    <Status chip={<Badge tone="active">Live</Badge>}>
      <span className="jp" lang="ja">
        {payee.legalName}
      </span>{' '}
      is registered and active on Sepolia
    </Status>
  )
}

/** 2. The payee's ENS name, resolved with stock viem, agrees with the registry. */
export function EnsStatus() {
  const { state } = usePayee(FIXTURE)
  const payout = state.status === 'ready' ? state.payee.payout : null
  const check = useEnsCheck('t2011001234567.payee.eth', payout)
  if (check === 'checking' || !payout) return <Status chip={<Checking />} />
  if (check !== 'match') return <Status chip={<Badge tone="pending">Not resolving</Badge>} />
  return (
    <Status chip={<Badge tone="active">Live</Badge>}>
      resolves to <span className="mono">{shortAddress(payout)}</span>, the registered payout
    </Status>
  )
}

/** 3. The recorded bank-change run: what the vault answered. */
export function RefusalStatus() {
  const name = RECORDED_BEC.outcome.error.name
  return (
    <Status chip={<Badge tone="neutral">Recorded run</Badge>}>
      the vault reverted <span className="mono">{name}</span>, and nothing moved
    </Status>
  )
}

/** 4. The booth company, greyed until its World ID officers are on chain; then its live state. */
export function BoothStatus() {
  const { state, refresh } = usePayee(BOOTH)
  const payee = state.status === 'ready' ? state.payee : null
  if (!payee || payee.status !== 'active' || payee.officerCount === 0) {
    return <Status chip={<Badge tone="neutral">At our booth</Badge>}>registering live today</Status>
  }
  const humans = `${payee.officerCount} verified human${payee.officerCount === 1 ? '' : 's'} as officers`
  return (
    <Status chip={<Badge tone="active">Live</Badge>}>
      {humans}
      {payee.payoutChangeLandsAt ? (
        <>
          {' · '}payout change lands in <Countdown to={payee.payoutChangeLandsAt} onElapsed={() => void refresh()} />
        </>
      ) : null}
    </Status>
  )
}

/** 6 and 7. What Curvegrid MultiBaas has indexed: every settlement, or only the x402 purchases. */
export function SettlementsStatus({ only }: { readonly only?: 'x402' }) {
  const load = useSettlements()
  if (load.kind === 'loading') return <Status chip={<Checking />} />
  if (load.kind === 'error') return <Status chip={<Badge>Unavailable</Badge>} />
  const rows = only ? load.data.settlements.filter((s) => s.kind === only) : load.data.settlements
  const what = only ? 'paid x402 purchases' : 'settlements'
  return (
    <Status chip={<Badge tone={load.stale ? 'pending' : 'active'}>{load.stale ? 'Reconnecting' : 'Live'}</Badge>}>
      {rows.length} {what} indexed since block {load.data.indexedFrom.toLocaleString('en-US')}
    </Status>
  )
}

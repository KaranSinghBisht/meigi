import { useEffect, useState, type ReactNode } from 'react'
import { blockTimestamps, scanRegistryEvents } from '../../lib/chain/events'
import { formatJst, shortAddress } from '../../lib/chain/format'
import { env } from '../../lib/env/env'
import { Badge } from '../../ui/components/Badge'
import { Countdown } from '../../ui/components/Countdown'
import { useEnsCheck, usePayee } from '../registry/usePayee'
import { useSettlements } from '../settlements/useSettlements'
import { LiveRefusalInline } from '../agent/refusal/LiveRefusal'

/** The fixture payee every check starts from: 株式会社メイギ商事 (fictional). */
export const FIXTURE = 'T2011001234567'
/** The company registered from a phone by World ID officers. */
export const OFFICER_RUN = 'T7999900000002'

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

/** 3. The vault refusing the bank-change scam's address, live on Sepolia when asked (the recorded run otherwise). */
export function RefusalStatus() {
  return <LiveRefusalInline />
}

/** When a T-number's registration landed, from its PayeeRegistered event: null until read, and if it can't be. */
function useRegisteredOn(tNumber: string, enabled: boolean): Date | null {
  const [on, setOn] = useState<Date | null>(null)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    scanRegistryEvents(env.registryFromBlock, controller.signal)
      .then(async ({ events }) => {
        const registered = events.find((event) => event.name === 'PayeeRegistered' && event.tNumber === tNumber)
        if (!registered) return
        const times = await blockTimestamps([registered.blockNumber])
        if (!controller.signal.aborted) setOn(times.get(registered.blockNumber) ?? null)
      })
      .catch((error: unknown) => {
        // The date is extra: the status still says who registered the company. Surface it for developers.
        if (!controller.signal.aborted) reportError(error)
      })
    return () => controller.abort()
  }, [tNumber, enabled])
  return on
}

/** 4. The company its World ID officers registered from a phone: pending until they are on chain, then its state. */
export function OfficersStatus() {
  const { state, refresh } = usePayee(OFFICER_RUN)
  const payee = state.status === 'ready' ? state.payee : null
  const registered = !!payee && payee.status === 'active' && payee.officerCount > 0 && !payee.placeholderOfficer
  const on = useRegisteredOn(OFFICER_RUN, registered)
  if (state.status === 'error') return <Status chip={<Badge>Unreachable</Badge>} />
  if (!payee) return <Status chip={<Checking />} />
  if (!registered) return <Status chip={<Badge tone="neutral">Pending</Badge>}>World ID phone run</Status>
  return (
    <Status chip={<Badge tone="active">Live</Badge>}>
      Registered by its officers with World ID{on ? ` on ${formatJst(on)}` : null}
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

import { useId, useState } from 'react'
import type { Settlement, SettlementKind } from '../../lib/api/settlements'
import { formatJst, shortHash, txUrl } from '../../lib/chain/format'
import { Badge } from '../../ui/components/Badge'
import { Button } from '../../ui/components/Button'
import { useSettlements, type SettlementsLoad } from './useSettlements'
import './settlements.css'

const KIND: Record<SettlementKind, string> = {
  invoice: 'Invoice paid by the AgentVault',
  router: 'Paid by T-number (PayRouter)',
  x402: 'x402 purchase by the research agent',
}

const FIRST_ROWS = 6
const blockNumber = (n: number) => n.toLocaleString('en-US')

function Status({ load }: { readonly load: SettlementsLoad }) {
  if (load.kind === 'loading') return <Badge tone="neutral">Loading</Badge>
  if (load.kind === 'error') return <Badge tone="pending">Unavailable</Badge>
  return load.stale ? <Badge tone="pending">Reconnecting</Badge> : <Badge tone="active">Live</Badge>
}

function Row({ settlement: s }: { readonly settlement: Settlement }) {
  return (
    <li className="settlement">
      <p className="settlement__amount num">{s.amount.display}</p>
      <div className="settlement__body">
        <p className="settlement__payee">
          {s.legalName ? (
            <span className="jp" lang="ja">
              {s.legalName}
            </span>
          ) : null}
          <span className="mono">{s.ens}</span>
          <span className="mono muted">{s.tNumber}</span>
        </p>
        <p className="settlement__meta">
          <span>{KIND[s.kind]}</span>
          <span className="settlement__token">indexed at block {blockNumber(s.blockNumber)}</span>
          {s.at ? <span className="settlement__token">{formatJst(s.at)}</span> : null}
          <a className="settlement__token mono" href={txUrl(s.txHash)} target="_blank" rel="noreferrer">
            {shortHash(s.txHash)} ↗
          </a>
        </p>
      </div>
    </li>
  )
}

function Empty({ tNumber, indexedFrom }: { readonly tNumber?: string; readonly indexedFrom: number }) {
  return (
    <p className="settlements__note muted">
      {tNumber ? `No payments to ${tNumber} indexed yet.` : 'No settlements indexed yet.'} MultiBaas indexes Meigi's
      contracts from block {blockNumber(indexedFrom)}.
    </p>
  )
}

interface SettlementsPanelProps {
  /** One payee's payments (e.g. on its registry page); every settlement when omitted. */
  readonly tNumber?: string
  readonly title?: string
}

/** Payments Meigi's contracts settled on Sepolia, newest first, live from Curvegrid MultiBaas's event index. */
export function SettlementsPanel({ tNumber, title = 'Settlements · indexed by Curvegrid MultiBaas' }: SettlementsPanelProps) {
  const id = useId()
  const load = useSettlements(tNumber)
  const [all, setAll] = useState(false)
  const rows = load.kind === 'ready' ? load.data.settlements : []
  const shown = all ? rows : rows.slice(0, FIRST_ROWS)
  return (
    <section className="settlements window" aria-labelledby={id} aria-live="polite">
      <header className="settlements__head">
        <h2 id={id} className="settlements__title">
          {title}
        </h2>
        <Status load={load} />
      </header>
      {load.kind === 'ready' ? (
        <p className="settlements__sub muted">
          {load.data.network} · MultiBaas indexes from block {blockNumber(load.data.indexedFrom)} · as of{' '}
          {formatJst(load.data.asOf)}
        </p>
      ) : null}
      {load.kind === 'loading' ? <p className="settlements__note muted">Reading MultiBaas…</p> : null}
      {load.kind === 'error' ? <p className="settlements__note muted">{load.message}</p> : null}
      {load.kind === 'ready' && rows.length === 0 ? <Empty tNumber={tNumber} indexedFrom={load.data.indexedFrom} /> : null}
      {shown.length > 0 ? (
        <ol className="settlements__list">
          {shown.map((s) => (
            <Row key={`${s.txHash}:${s.kind}:${s.tNumber}`} settlement={s} />
          ))}
        </ol>
      ) : null}
      {rows.length > FIRST_ROWS ? (
        <div className="settlements__more">
          <Button variant="quiet" size="sm" onClick={() => setAll((v) => !v)}>
            {all ? 'Show fewer' : `Show all ${rows.length}`}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

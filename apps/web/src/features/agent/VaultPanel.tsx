import { useId, type ReactNode } from 'react'
import { formatJst, shortAddress } from '../../lib/chain/format'
import { FIXTURE_T_NUMBER } from '../../lib/chain/tNumber'
import type { VaultState } from '../../lib/chain/vault'
import { env } from '../../lib/env/env'
import { Address } from '../../ui/components/Address'
import { Badge } from '../../ui/components/Badge'
import { useEnsCheck, usePayee, type EnsCheck } from '../registry/usePayee'
import { AGENT_ENS_NAME, useAgentEns } from './useAgentEns'
import { useVault, type VaultLoad } from './useVault'
import './vault.css'

const ENS_NOTES: Record<EnsCheck, { text: string; tone: 'ok' | 'muted' | 'bad' }> = {
  checking: { text: 'checking…', tone: 'muted' },
  match: { text: '✓ resolves to this vault', tone: 'ok' },
  none: { text: 'not resolving yet', tone: 'muted' },
  other: { text: 'resolves to a different address', tone: 'bad' },
  error: { text: 'lookup failed', tone: 'muted' },
}

interface TileProps {
  readonly label: string
  readonly value: ReactNode
  readonly unit: string
  readonly lead?: boolean
}

/** One figure: a label, the number in large tabular digits, and what it counts. The lead figure is the largest. */
function Tile({ label, value, unit, lead = false }: TileProps) {
  return (
    <div className={lead ? 'vault-tile vault-tile--lead' : 'vault-tile'}>
      <p className="vault-tile__label">{label}</p>
      <p className="vault-tile__value num">{value}</p>
      <p className="vault-tile__unit">{unit}</p>
    </div>
  )
}

function Tiles({ vault }: { readonly vault: VaultState }) {
  const { vendor, symbol } = vault
  return (
    <div className="vault-tiles cells">
      <Tile lead label="Balance" value={vault.balance} unit={symbol} />
      <Tile label="Per payment" value={vendor.approved ? vendor.capPerPayment : '—'} unit={`${symbol} at most`} />
      <Tile
        label="Left this period"
        value={vendor.remainingInPeriod ?? '—'}
        unit={vendor.approved ? `of ${vendor.capPerPeriod}` : symbol}
      />
    </div>
  )
}

/** Whether the agent key can pay at all right now: the owner can pause the vault. */
function VaultStatus({ load }: { readonly load: VaultLoad }) {
  if (load.kind !== 'ready') return null
  const { paused } = load.vault
  return <Badge tone={paused ? 'disputed' : 'active'}>{paused ? 'Paused by the owner' : 'Active'}</Badge>
}

function Vendor({ vault, name }: { readonly vault: VaultState; readonly name: string | null }) {
  const { vendor } = vault
  if (!vendor.approved || !vendor.payout) {
    return <p className="vault-vendor muted">{FIXTURE_T_NUMBER} is not approved in this vault.</p>
  }
  return (
    <p className="vault-vendor">
      <span className="jp" lang="ja">
        {name ?? FIXTURE_T_NUMBER}
      </span>
      <span className="vault-vendor__to">
        → <span className="mono">{shortAddress(vendor.payout)}</span>
      </span>
      {!vendor.active && vendor.activeAt ? (
        <span className="vault-vendor__pending">payments open {formatJst(vendor.activeAt)}</span>
      ) : null}
    </p>
  )
}

/** The AgentVault as a dashboard panel: what it holds, what it may pay and to whom, and its ENS name. */
export function VaultPanel({ version }: { readonly version: number }) {
  const id = useId()
  const load = useVault(version)
  const { state: payee } = usePayee(FIXTURE_T_NUMBER)
  // Empty unless the vendor is active: a disputed payee's name is withheld, so the T-number is shown instead.
  const name = payee.status === 'ready' ? payee.payee.legalName || null : null
  const ens = ENS_NOTES[useEnsCheck(AGENT_ENS_NAME, env.vault)]
  const { primary } = useAgentEns()
  return (
    <section className="vault-panel window" aria-labelledby={id} aria-live="polite">
      <header className="vault-panel__head">
        <h2 id={id} className="vault-panel__title">
          AgentVault
        </h2>
        <VaultStatus load={load} />
        <span className="vault-panel__address">
          <Address value={env.vault} short />
        </span>
      </header>
      {load.kind === 'loading' ? <p className="vault-panel__note muted">Reading Sepolia…</p> : null}
      {load.kind === 'error' ? <p className="vault-panel__note muted">{load.message}</p> : null}
      {load.kind === 'ready' ? <Tiles vault={load.vault} /> : null}
      <div className="vault-panel__section">
        <p className="vault-panel__label">Approved vendor</p>
        {load.kind === 'ready' ? <Vendor vault={load.vault} name={name} /> : <p className="muted">…</p>}
      </div>
      <p className="vault-panel__foot">
        <span className="mono">{AGENT_ENS_NAME}</span>
        <span className={`vault-panel__ens vault-panel__ens--${ens.tone}`}>{ens.text}</span>
        {primary ? <span className="vault-panel__ens vault-panel__ens--ok">✓ primary name</span> : null}
      </p>
    </section>
  )
}

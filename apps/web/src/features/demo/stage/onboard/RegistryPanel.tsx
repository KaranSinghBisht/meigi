import { formatJst } from '../../../../lib/chain/format'
import { HankoMark } from '../../../../ui/brand/HankoMark'
import { ONBOARD } from '../../content/onboard'
import { Chip } from '../panel/parts'
import './registry.css'

const ROWS: readonly { readonly id: string; readonly label: string; readonly value: string; readonly note?: string }[] =
  [
    { id: 'tnumber', label: 'T-number', value: ONBOARD.tNumber, note: ONBOARD.legalName },
    { id: 'ens', label: 'ENS name', value: ONBOARD.ens },
    { id: 'controller', label: 'Business wallet', value: ONBOARD.controllerShort, note: 'controls the record' },
    { id: 'payout', label: 'Payout', value: ONBOARD.payoutShort, note: 'the one address paid' },
    { id: 'domain', label: 'Domain', value: ONBOARD.domain, note: 'proven' },
    { id: 'officers', label: 'Officers', value: ONBOARD.officerShort, note: 'World ID officer id' },
    { id: 'evidence', label: 'Evidence', value: ONBOARD.evidenceShort, note: 'hash of the verification bundle' },
  ]

/** Chapter 0's side panel: what the registry on Sepolia will hold for this company, filling in step by step. */
export function RegistryPanel() {
  return (
    <aside className="rpanel" data-d="registry">
      <header className="rpanel__head">
        <HankoMark size={32} />
        <div className="rpanel__who">
          <p className="rpanel__name">Meigi registry</p>
          <p className="rpanel__sub mono">PayeeRegistry {ONBOARD.registryShort} · Sepolia</p>
        </div>
        <span className="rpanel__status">
          <span data-d="r-status-none">
            <Chip tone="muted">Not registered</Chip>
          </span>
          <span data-d="r-status-active" data-enter="">
            <Chip tone="ok">Active</Chip>
          </span>
        </span>
      </header>
      <p className="rpanel__lede">
        What the chain will hold for <span className="mono">{ONBOARD.tNumber}</span>
      </p>
      <dl className="rpanel__rows">
        {ROWS.map((row) => (
          <div key={row.id} className="rpanel__row" data-d={`r-${row.id}`} data-enter="">
            <dt>{row.label}</dt>
            <dd>
              <span className="mono">{row.value}</span>
              {row.note ? <span className="rpanel__note">{row.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      <section className="rpanel__event" data-d="r-event" data-enter="">
        <p className="mono">PayeeRegistered({ONBOARD.tNumber})</p>
        <p className="rpanel__note">
          tx <span className="mono">{ONBOARD.txShort}</span> · block {ONBOARD.block.toLocaleString('en-US')} ·{' '}
          {formatJst(ONBOARD.at)}
        </p>
      </section>
      <p className="rpanel__resolve" data-d="r-resolve" data-enter="">
        ✓ <span className="mono">{ONBOARD.ens}</span> → <span className="mono">{ONBOARD.payoutShort}</span>
      </p>
    </aside>
  )
}

import { formatJst } from '../../../../lib/chain/format'
import { HankoMark } from '../../../../ui/brand/HankoMark'
import { ONBOARD } from '../../content/onboard'
import { Chip } from '../panel/parts'
import './registry.css'

interface Row {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly note?: string
}

const DOMAIN_NOTE: Readonly<Record<string, string>> = {
  dns: 'proven (signed DNS record)',
  'well-known': 'proven (signed .well-known file)',
}

function domainRow(): Row {
  const { name, method } = ONBOARD.domain
  if (method === 'fixture') return { id: 'domain', label: 'Domain', value: 'skipped', note: 'fictional demo company' }
  return { id: 'domain', label: 'Domain', value: name ?? 'none', note: DOMAIN_NOTE[method] ?? 'proven' }
}

function officersRow(): Row {
  const [first] = ONBOARD.officers
  const n = ONBOARD.officers.length
  const value = n === 1 && first ? first.short : `${n} officers`
  const note = ONBOARD.placeholder ? 'placeholder officer (demo company)' : `World ID ${n === 1 ? 'officer' : 'officers'}`
  return { id: 'officers', label: 'Officers', value, note }
}

/** What the registry holds for the company, from the recorded registration (its event and officersOf). */
const ROWS: readonly Row[] = [
  { id: 'tnumber', label: 'T-number', value: ONBOARD.tNumber, note: ONBOARD.legalName },
  { id: 'ens', label: 'ENS name', value: ONBOARD.ens },
  { id: 'controller', label: 'Business key', value: ONBOARD.controllerShort, note: 'requests changes' },
  { id: 'payout', label: 'Payout address', value: ONBOARD.payoutShort, note: 'the one address paid' },
  domainRow(),
  officersRow(),
  {
    id: 'evidence',
    label: 'Evidence',
    value: ONBOARD.evidenceShort,
    note: ONBOARD.seeded ? 'fixture evidence (fictional company)' : 'hash of the verification bundle',
  },
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

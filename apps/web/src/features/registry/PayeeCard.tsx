import { Link } from 'react-router'
import { shortHash } from '../../lib/chain/format'
import type { PayeeSnapshot } from '../../lib/chain/registry'
import { Address } from '../../ui/components/Address'
import { Badge } from '../../ui/components/Badge'
import { CopyButton } from '../../ui/components/CopyButton'
import { PendingBanner } from './PendingBanner'
import { useEnsCheck, type EnsCheck } from './usePayee'
import './registry.css'

const STATUS_BADGE = {
  active: { tone: 'active', label: 'Active' },
  disputed: { tone: 'disputed', label: 'Disputed' },
  unregistered: { tone: 'neutral', label: 'Unregistered' },
} as const

/**
 * Evidence hashes of the fictional demo fixtures (see contracts/script/seed-demo.sh). These companies are not in
 * the NTA data, and the UI must never claim they are.
 */
const FIXTURE_EVIDENCE = new Set([
  '0xf8b96e6b0387f0ec42ba9d83575afbfe17774918210bba7a834f3b562e3248ae', // demo-fixture:fictional-vendor
  '0x7f399c3e3d13209f8b4cbeb0a56a7e64c796adc27b00f9ae23079c0e59730021', // demo-fixture:fictional-merchant
])

function nameProvenance(evidence: string): string {
  return FIXTURE_EVIDENCE.has(evidence.toLowerCase())
    ? 'Fictional demo company, marked as such in its on-chain evidence (not an NTA record)'
    : 'Registered name, an exact match of the NTA record'
}

type NoteTone = 'ok' | 'muted' | 'bad'

/** ENS must agree with the registry: the active payout, or nothing at all for a frozen or unknown payee. */
function ensNote(check: EnsCheck, active: boolean): { text: string; tone: NoteTone } {
  if (check === 'checking') return { text: 'checking ENS…', tone: 'muted' }
  if (check === 'error') return { text: 'ENS lookup failed', tone: 'muted' }
  if (active) {
    if (check === 'match') return { text: '✓ resolves to this payout', tone: 'ok' }
    if (check === 'none') return { text: 'not resolving yet', tone: 'muted' }
    return { text: 'resolves to a different address', tone: 'bad' }
  }
  if (check === 'none') return { text: '✓ resolves to nothing (fails closed)', tone: 'ok' }
  return { text: 'resolves to an address although not active', tone: 'bad' }
}

function EnsLine({ payee }: { readonly payee: PayeeSnapshot }) {
  const check = useEnsCheck(payee.tNumber.ens, payee.payout)
  const note = ensNote(check, payee.status === 'active')
  return (
    <p className="payee__ens">
      <span className="mono">{payee.tNumber.ens}</span>
      <span className={`payee__ens-note payee__ens-note--${note.tone}`}>{note.text}</span>
    </p>
  )
}

function Unregistered({ payee }: { readonly payee: PayeeSnapshot }) {
  return (
    <div className="payee__empty">
      <p>
        No company is registered under <strong className="mono">{payee.tNumber.display}</strong>. Anything that pays
        through Meigi refuses this T-number.
      </p>
      <Link to="/register">Register this business →</Link>
    </div>
  )
}

function Pending({ payee, onElapsed }: { readonly payee: PayeeSnapshot; readonly onElapsed: () => void }) {
  return (
    <>
      {payee.payoutChangeLandsAt ? (
        <PendingBanner kind="payout" landsAt={payee.payoutChangeLandsAt} onElapsed={onElapsed} />
      ) : null}
      {payee.rotationLandsAt ? (
        <PendingBanner kind="rotation" landsAt={payee.rotationLandsAt} onElapsed={onElapsed} />
      ) : null}
      {payee.disputeResolvesAt ? (
        <PendingBanner kind="dispute" landsAt={payee.disputeResolvesAt} onElapsed={onElapsed} />
      ) : null}
    </>
  )
}

function Payout({ payee }: { readonly payee: PayeeSnapshot }) {
  if (payee.status === 'disputed') {
    return (
      <div className="payee__frozen">
        <p className="payee__label">Pays</p>
        <p className="payee__frozen-text">Nobody. Payments are frozen while two parties claim this T-number.</p>
      </div>
    )
  }
  if (!payee.payout) return null
  return (
    <div className="payee__payout">
      <p className="payee__label">The only address it can be paid at</p>
      <p className="payee__payout-value">
        <Address value={payee.payout} />
        <CopyButton value={payee.payout} />
      </p>
    </div>
  )
}

function Facts({ payee }: { readonly payee: PayeeSnapshot }) {
  const hours = Math.round(payee.changeDelaySeconds / 3600)
  return (
    <dl className="facts payee__facts">
      <dt>Officers</dt>
      <dd>
        {payee.threshold} of {payee.officerCount} must approve a change
      </dd>
      <dt>Controller</dt>
      <dd>{payee.controller ? <Address value={payee.controller} short /> : '—'}</dd>
      <dt>Timelock</dt>
      <dd>{hours} h in public before any payout or key change lands</dd>
      <dt>Evidence</dt>
      <dd className="mono" title={payee.evidence}>
        {shortHash(payee.evidence)}
      </dd>
    </dl>
  )
}

interface PayeeCardProps {
  readonly payee: PayeeSnapshot
  readonly onElapsed: () => void
  readonly showChangeLink?: boolean
}

export function PayeeCard({ payee, onElapsed, showChangeLink = true }: PayeeCardProps) {
  const badge = STATUS_BADGE[payee.status]
  return (
    <article className="payee" aria-labelledby="payee-name">
      <header className="payee__head">
        <div className="payee__ids">
          <p className="payee__tnumber mono">{payee.tNumber.display}</p>
          <EnsLine payee={payee} />
        </div>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </header>
      <h2 id="payee-name" className="payee__name jp" lang="ja">
        {payee.legalName || 'Not registered'}
      </h2>
      {payee.legalName ? <p className="payee__sub">{nameProvenance(payee.evidence)}</p> : null}
      {payee.status === 'unregistered' ? <Unregistered payee={payee} /> : null}
      {payee.status !== 'unregistered' ? (
        <>
          <Pending payee={payee} onElapsed={onElapsed} />
          <Payout payee={payee} />
          <Facts payee={payee} />
          {showChangeLink && payee.status === 'active' ? (
            <p className="payee__actions">
              <Link to={`/change/${payee.tNumber.display}`}>Request a change for this company →</Link>
            </p>
          ) : null}
        </>
      ) : null}
    </article>
  )
}

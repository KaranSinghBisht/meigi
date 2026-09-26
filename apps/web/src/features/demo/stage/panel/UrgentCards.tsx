import { formatJstTime } from '../../../../lib/chain/format'
import { HankoMark } from '../../../../ui/brand/HankoMark'
import { Spinner } from '../../../../ui/components/Spinner'
import { useQr } from '../../../../ui/world/useQr'
import { keepTokens } from '../../content/tokens'
import { APPROVAL, PAID, URGENT } from '../../content/urgent'
import { checkLabel, layerLabel, percent } from './checks'
import { Bar, Card, Chip, Field } from './parts'

const { analysis, triage } = URGENT

function ReadCard() {
  return (
    <Card name="u-card-read" title="1 · Read" meta="deterministic, no model">
      <dl className="pfields">
        <Field label="T-number" name="u-f-tNumber">
          <span className="mono">{URGENT.tNumber}</span>
        </Field>
        <Field label="Amount" name="u-f-amount">
          {URGENT.amount}
        </Field>
        <Field label="Pay to (as printed)" name="u-f-address">
          <span className="mono">{URGENT.payToShort}</span>
        </Field>
        <Field label="Invoice" name="u-f-invoice">
          <span className="mono">{URGENT.invoice}</span>
        </Field>
      </dl>
      {analysis.extracted.flags.map((flag) => (
        <p key={flag.code} className="pcard__row" data-d="u-flag" data-enter="">
          <Chip tone="hold">{flag.evidence ?? flag.code}</Chip>
          <span className="pcard__note">{flag.message}</span>
        </p>
      ))}
    </Card>
  )
}

function TriageCard() {
  const needs = triage.minPSafe ?? 0.9
  return (
    <Card
      name="u-card-triage"
      title="2 · Triage"
      meta={`${triage.model ?? triage.backend} · 0.8B · ${triage.latencyMs} ms`}
    >
      <div className="pbars">
        <Bar
          name="u-bar-pressure"
          label="pressure to pay fast"
          value={percent(triage.pressure)}
          fill={triage.pressure}
        />
        <Bar
          name="u-bar-safe"
          label={`routine and safe (needs ${needs.toFixed(2)})`}
          value={(triage.pSafe ?? 0).toFixed(2)}
          fill={triage.pSafe ?? 0}
          tone="ok"
        />
        <Bar
          name="u-bar-susp"
          label="suspicion"
          value={`${triage.suspicion.score.toFixed(2)} / 3`}
          fill={triage.suspicion.score / 3}
          tone="ok"
        />
      </div>
      <p className="pcard__row" data-d="u-triage-hold" data-enter="">
        <Chip tone="hold">Hold</Chip>
        <span className="pcard__note">{triage.suspicion.level}</span>
      </p>
    </Card>
  )
}

/** This run's analysis was recorded before its payment, so every check the vault will make passes here. */
function KernelCard() {
  const { checks } = analysis.kernel
  const passed = checks.filter((check) => check.ok).length
  return (
    <Card name="u-card-kernel" title="3 · Kernel" meta={`${passed} of ${checks.length} checks pass`}>
      <ul className="pchecks pchecks--grid">
        {checks.map((check) => (
          <li key={check.code} className={check.ok ? 'pcheck' : 'pcheck pcheck--fail'}>
            <span className="pcheck__mark" aria-hidden="true">
              {check.ok ? '✓' : '✗'}
            </span>
            <span className="pcheck__label">{checkLabel(check.code)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function DecisionCard() {
  return (
    <Card name="u-card-decision" title="4 · Decision" meta="a person decides">
      <p className="pverdict">
        <Chip tone="hold">HOLD</Chip>
        <span className="pverdict__line">until a human approves with World ID</span>
      </p>
      <ol className="preasons">
        {URGENT.holds.map((reason) => (
          <li key={reason.code}>
            <b>{layerLabel(reason.layer)}</b> {keepTokens(reason.message)}
          </li>
        ))}
      </ol>
      <p className="pcard__note">
        A human approving through World ID for Agents may release these holds. Nothing is paid until then.
      </p>
    </Card>
  )
}

function WorldIdCard() {
  const qr = useQr(APPROVAL.qrUri)
  return (
    <Card name="u-card-world" title="5 · World ID for Agents" meta="device flow · sandbox IdP" className="pcard--world">
      <div className="pworld">
        <span className="pworld__qr">
          {qr.src ? <img src={qr.src} alt="" width={96} height={96} /> : null}
          {qr.failed ? <span className="pcard__note">QR unavailable</span> : null}
        </span>
        <div className="pworld__body">
          <p className="mono pworld__link">{APPROVAL.link}</p>
          <p className="pworld__code">
            <span className="pcard__note">Code</span>
            <span className="pworld__code-value">{APPROVAL.code}</span>
          </p>
        </div>
      </div>
      <div className="pworld__status">
        <p className="pcard__row pworld__wait" data-d="u-world-wait">
          <Spinner />
          <span>Waiting for a human to approve this payment with World ID</span>
        </p>
        <p className="pcard__row pworld__ok" data-d="u-world-ok" data-enter="">
          <HankoMark glyphs="承認" tone="jade" size={36} />
          <span>
            <b>Approved by the enrolled approver</b>
            <span className="pcard__note">
              Sandbox token: acr {APPROVAL.acr} · approved {formatJstTime(APPROVAL.approvedAt)}, checked fresh ·
              single-use, bound to {URGENT.invoice}
            </span>
          </span>
        </p>
      </div>
    </Card>
  )
}

function PaidCard() {
  return (
    <Card name="u-card-paid" title="6 · Pay" meta="through the vault's checks" className="pcard--paid">
      <p className="pverdict">
        <Chip tone="ok">Paid</Chip>
        <span className="pverdict__line">
          {PAID.amount} → <span className="mono">{PAID.payToShort}</span>
        </span>
      </p>
      <p className="pcard__note">
        tx <span className="mono">{PAID.txShort}</span> · block {PAID.block.toLocaleString('en-US')} ·{' '}
        {formatJstTime(PAID.at)} · Sepolia
      </p>
      <p className="pcard__note">
        Sent by the agent key through the ENS MandateGate, under the mandate{' '}
        <span className="mono">{PAID.mandate}</span>
      </p>
    </Card>
  )
}

export function UrgentCards() {
  return (
    <>
      <ReadCard />
      <TriageCard />
      <KernelCard />
      <DecisionCard />
      <WorldIdCard />
      <PaidCard />
    </>
  )
}

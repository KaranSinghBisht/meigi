import { HankoMark } from '../../../../ui/brand/HankoMark'
import { BEC } from '../../content/bec'
import { checkLabel, layerLabel, modelName, percent } from './checks'
import { Bar, Card, Chip, Field, Typed } from './parts'

const { analysis, outcome } = BEC

function ReadCard() {
  return (
    <Card name="bec-card-read" title="1 · Read" meta="deterministic, no model">
      <dl className="pfields">
        <Field label="T-number" name="bec-f-tNumber">
          <span className="mono">{BEC.tNumber}</span>
        </Field>
        <Field label="Amount" name="bec-f-amount">
          {BEC.amount}
        </Field>
        <Field label="Pay to (as printed)" name="bec-f-address">
          <span className="mono">{BEC.payToShort}</span>
        </Field>
        <Field label="Invoice" name="bec-f-invoice">
          <span className="mono">{BEC.invoice}</span>
        </Field>
      </dl>
    </Card>
  )
}

function TriageCard() {
  const triage = analysis.triage
  if (triage.status !== 'ok') return null
  const { requestType, suspicion } = triage
  return (
    <Card name="bec-card-triage" title="2 · Triage" meta={`${triage.model ?? triage.backend} · 0.8B · ${triage.latencyMs} ms`}>
      <div className="pbars">
        <Bar
          name="bec-bar-type"
          label={requestType.value.replaceAll('_', ' ')}
          value={percent(requestType.confidence)}
          fill={requestType.confidence}
        />
        <Bar name="bec-bar-dest" label="new destination" value={triage.newDestination.toFixed(2)} fill={triage.newDestination} />
        <Bar
          name="bec-bar-susp"
          label="suspicion"
          value={`${suspicion.score.toFixed(2)} / 3`}
          fill={suspicion.score / 3}
          tone="bad"
        />
      </div>
      <p className="pcard__row" data-d="bec-triage-hold" data-enter="">
        <Chip tone="hold">Hold</Chip>
        <span className="pcard__note">{suspicion.level}</span>
      </p>
    </Card>
  )
}

function BeliefCard() {
  const proposal = analysis.proposal
  if (proposal.status !== 'ok') return null
  return (
    <Card name="bec-card-belief" title="3 · The agent's belief" meta={`LLM · ${modelName(proposal.model)}`}>
      <blockquote className="pquote">
        <Typed name="bec-belief-text" text={`“${proposal.reasoning}”`} />
      </blockquote>
      <p className="pcard__row pwants" data-d="bec-belief-wants" data-enter="">
        <span className="pcard__note">Wants to pay</span>
        <b>{BEC.amount}</b>
        <span aria-hidden="true">→</span>
        <span className="mono ptoken ptoken--bad">{BEC.payToShort}</span>
      </p>
    </Card>
  )
}

function KernelCard() {
  return (
    <Card name="bec-card-kernel" title="4 · Kernel" meta="reads the chain · Sepolia">
      <ul className="pchecks">
        {analysis.kernel.checks.map((check, index) => (
          <li
            key={check.code}
            className={check.ok ? 'pcheck' : 'pcheck pcheck--fail'}
            data-d={`bec-check-${index}`}
            data-enter=""
          >
            <span className="pcheck__mark" aria-hidden="true">
              {check.ok ? '✓' : '✗'}
            </span>
            <span className="pcheck__label">{checkLabel(check.code)}</span>
            {check.ok ? null : (
              <span className="pcheck__detail">
                <span className="mono ptoken">{BEC.ens}</span> → <span className="mono ptoken">{BEC.registeredShort}</span>
                <span className="pcheck__msg">{check.message}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function ScreeningCard() {
  const screening = analysis.screening
  const note = screening.status === 'ok' ? `${screening.results.length} addresses screened` : screening.reason
  return (
    <Card name="bec-card-screen" title="5 · Screening" meta="Intercepta">
      <p className="pcard__row">
        <Chip tone="muted">{screening.status === 'ok' ? 'Screened' : 'Not in this run'}</Chip>
        <span className="pcard__note">{note}</span>
      </p>
    </Card>
  )
}

function DecisionCard() {
  const blocking = BEC.blocking
  return (
    <Card name="bec-card-decision" title="6 · Decision" meta={`${blocking.length} blocking reasons`} className="pcard--decision">
      <p className="pverdict">
        <Chip tone="hold">HOLD</Chip>
        <span className="pverdict__line">
          {BEC.amount} → <span className="mono">{BEC.payToShort}</span> is not paid.
        </span>
      </p>
      <ol className="preasons">
        {blocking.map((reason) => (
          <li key={reason.code}>
            <b>{layerLabel(reason.layer)}</b> {reason.message}
          </li>
        ))}
      </ol>
      <p className="pexplain">
        <span className="pcard__note">In the model's words ({modelName(analysis.explanation.model)}):</span>
        <Typed name="bec-explain" text={analysis.explanation.text} />
      </p>
      <p className="pforce">
        <span className="btn btn--accent btn--sm" data-d="bec-force">
          Let the agent pay anyway
        </span>
      </p>
      <div className="pseal" data-d="bec-seal" data-enter="">
        <HankoMark glyphs="拒否" size={52} />
        <span className="pseal__text">
          <b>{outcome.error.name}</b>
          Refused by the vault. {outcome.broadcast ? 'The transaction reverted.' : 'Nothing was broadcast.'}
        </span>
      </div>
    </Card>
  )
}

export function BecCards() {
  return (
    <>
      <ReadCard />
      <TriageCard />
      <BeliefCard />
      <KernelCard />
      <ScreeningCard />
      <DecisionCard />
    </>
  )
}

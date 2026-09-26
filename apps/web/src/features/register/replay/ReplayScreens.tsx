import type { ReactNode } from 'react'
import { parseTNumber } from '../../../lib/chain/tNumber'
import { Address } from '../../../ui/components/Address'
import { Badge } from '../../../ui/components/Badge'
import { TextField } from '../../../ui/components/Field'
import { Notice } from '../../../ui/components/Notice'
import { CredentialNote } from '../../../ui/world/CredentialNote'
import { EnsPreview } from '../company/EnsPreview'
import { COPY } from '../flow/copy'
import { STEP, type StepIndex } from '../flow/steps'
import { OfficerList } from '../officers/OfficerList'
import { RegisteredView } from '../registered/RegisteredView'
import { RepresentativeBody } from '../representative/RepresentativeStep'
import { LookupDetails, SummaryCard } from '../review/SummaryCard'
import { ThresholdPicker } from '../review/ThresholdPicker'
import { PayoutChoice } from '../wallets/PayoutChoice'
import { StepFrame } from '../wizard/StepFrame'
import type { Recording } from './recording'
import '../company/company.css'
import '../wallets/wallets.css'

interface ScreenProps {
  readonly recording: Recording
  readonly actions: ReactNode
}

/** The company card as the first screen showed it: the NTA record, or a fictional company and why it is one. */
function RecordedCompany({ company }: { readonly company: Recording['company'] }) {
  if (!company.fixture) {
    return (
      <div className="company-record nta-hint">
        <p className="company-record__chips">
          <Badge tone="active">Found in the NTA registry</Badge>
        </p>
        <p className="company-record__name jp" lang="ja">
          {company.legalName}
        </p>
        {company.address ? <p className="company-record__address">{company.address}</p> : null}
      </div>
    )
  }
  return (
    <div className="company-record company-record--fictional nta-hint">
      <p className="company-record__chips">
        <Badge tone="info">Fictional demo company</Badge>
      </p>
      {company.note ? <p className="company-record__note">{company.note}</p> : null}
      <TextField label="Company name" lang="ja" className="input--jp" value={company.legalName} readOnly />
    </div>
  )
}

function CompanyScreen({ recording, actions }: ScreenProps) {
  const { company } = recording
  return (
    <StepFrame step={STEP.company} title={COPY.company.title} lede={COPY.company.lede} actions={actions}>
      <TextField label="T-number or LEI" className="input--hero" mono value={company.query} readOnly />
      <EnsPreview digits={company.tNumber.slice(1)} />
      <RecordedCompany company={company} />
    </StepFrame>
  )
}

function PayoutDetail({ payout }: { readonly payout: Recording['payout'] }) {
  if (payout.mode === 'paste') {
    return <TextField label="Payout address" mono value={payout.address} readOnly />
  }
  return (
    <div className="onboard-cell new-wallet">
      {payout.mode === 'create' ? (
        <p className="new-wallet__chips">
          <Badge tone="info">Testnet demo wallet</Badge>
          <Badge tone="active">Backup saved</Badge>
        </p>
      ) : null}
      <Address value={payout.address} copy />
    </div>
  )
}

function WalletsScreen({ recording, actions }: ScreenProps) {
  return (
    <StepFrame step={STEP.wallets} title={COPY.wallets.title} lede={COPY.wallets.lede} actions={actions}>
      <section className="onboard-section" aria-labelledby="replay-key">
        <h3 id="replay-key" className="onboard-section__title">
          Business key
        </h3>
        <p className="onboard-section__lede">It signs your domain proof, and every change after today.</p>
        <div className="onboard-cell wallet-cell">
          <div className="wallet-cell__row">
            <Address value={recording.controller} copy />
            <Badge tone="active">Connected</Badge>
          </div>
        </div>
      </section>
      <section className="onboard-section" aria-labelledby="replay-payout">
        <h3 id="replay-payout" className="onboard-section__title">
          Payout address
        </h3>
        <p className="onboard-section__lede">The only address payers who check Meigi will send money to.</p>
        <PayoutChoice mode={recording.payout.mode} disabled />
        <PayoutDetail payout={recording.payout} />
      </section>
    </StepFrame>
  )
}

function DomainScreen({ recording, actions }: ScreenProps) {
  const { domain, company } = recording
  if (domain.method === 'fixture') {
    return (
      <StepFrame step={STEP.domain} title={COPY.domainFictional.title} lede={COPY.domainFictional.lede} actions={actions}>
        <Notice tone="info" title="Fictional demo company">
          <p>
            {company.note ? `${company.note} ` : null}There's nothing to sign and no DNS record to add.
          </p>
        </Notice>
      </StepFrame>
    )
  }
  const how = domain.method === 'dns' ? 'a signed DNS TXT record' : 'a signed file at /.well-known/meigi.json'
  return (
    <StepFrame step={STEP.domain} title="Your domain is proven" actions={actions}>
      <Notice tone="success" title={`${domain.name ?? 'The domain'} is proven.`}>
        <p>The business key signed the challenge, published as {how}.</p>
      </Notice>
    </StepFrame>
  )
}

function RepresentativeScreen({ recording, actions }: ScreenProps) {
  return (
    <StepFrame
      step={STEP.representative}
      title={COPY.representative.title}
      lede={COPY.representative.lede}
      actions={actions}
    >
      <RepresentativeBody fixture={recording.company.fixture} />
    </StepFrame>
  )
}

const PLACEHOLDER_LEDE =
  'Real companies enroll officers with World ID. This demo company has a placeholder officer no one can prove, so no one can change its payout.'

function OfficersScreen({ recording, actions }: ScreenProps) {
  const placeholder = recording.officers.some((officer) => officer.proof === 'placeholder')
  return (
    <StepFrame
      step={STEP.officers}
      title={COPY.officers.title}
      lede={placeholder ? PLACEHOLDER_LEDE : COPY.officers.lede}
      actions={actions}
    >
      {placeholder ? null : <CredentialNote />}
      <OfficerList officers={recording.officers} />
    </StepFrame>
  )
}

function officersText(officers: Recording['officers']): string {
  const n = officers.length
  if (officers.some((officer) => officer.proof === 'placeholder')) {
    return `${n} placeholder ${n === 1 ? 'officer' : 'officers'}`
  }
  return `${n} verified ${n === 1 ? 'human' : 'humans'}`
}

function ReviewScreen({ recording, actions }: ScreenProps) {
  const { company, controller, payout, domain, officers, threshold } = recording
  const summary = {
    company: { ...company },
    legalName: company.legalName,
    controller,
    payout: payout.address,
    domain: domain.name,
    domainMethod: domain.method,
    officers: officersText(officers),
  }
  return (
    <StepFrame step={STEP.review} title={COPY.review.title} lede={COPY.review.lede} actions={actions}>
      <SummaryCard summary={summary} />
      <LookupDetails company={summary.company} />
      <ThresholdPicker max={Math.max(officers.length, 1)} value={threshold} disabled />
    </StepFrame>
  )
}

function RegisteredScreen({ recording, actions }: ScreenProps) {
  const parsed = parseTNumber(recording.company.tNumber)
  if (!parsed) return null
  return (
    <StepFrame
      step={STEP.registered}
      title={COPY.registered.title}
      lede={COPY.registered.lede(parsed.ens)}
      actions={actions}
    >
      <RegisteredView
        legalName={recording.company.legalName}
        tNumber={parsed.display}
        ens={parsed.ens}
        payout={recording.payout.address}
        fixture={recording.company.fixture}
        txHash={recording.txHash}
      />
    </StepFrame>
  )
}

const SCREENS: Record<StepIndex, (props: ScreenProps) => ReactNode> = {
  [STEP.company]: CompanyScreen,
  [STEP.wallets]: WalletsScreen,
  [STEP.domain]: DomainScreen,
  [STEP.representative]: RepresentativeScreen,
  [STEP.officers]: OfficersScreen,
  [STEP.review]: ReviewScreen,
  [STEP.registered]: RegisteredScreen,
}

/** One recorded screen, drawn with the live wizard's own parts and the recording's values, read-only. */
export function ReplayScreen({ step, ...props }: ScreenProps & { readonly step: StepIndex }) {
  const Screen = SCREENS[step]
  return <Screen {...props} />
}

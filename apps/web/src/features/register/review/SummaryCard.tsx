import type { ReactNode } from 'react'
import { parseTNumber } from '../../../lib/chain/tNumber'
import type { HexAddress } from '../../../lib/env/env'
import { Address } from '../../../ui/components/Address'
import { Badge, type BadgeTone } from '../../../ui/components/Badge'
import type { Company } from '../flow/useOnboarding'
import './review.css'

/** What a registration submits, as the review screen shows it (live or replayed). */
export interface Summary {
  readonly company: Company
  /** The registered name: the verifier's exact NTA name, or a fictional company's own. */
  readonly legalName: string
  readonly controller: HexAddress
  readonly payout: HexAddress
  /** Null when none was recorded (a seeded demo company). */
  readonly domain: string | null
  readonly domainMethod: string | null
  /** e.g. "2 verified humans". */
  readonly officers: string
}

/** How the verifier accepted the domain, as the chip beside it says. */
const PROOF: Record<string, { tone: BadgeTone; label: string }> = {
  dns: { tone: 'active', label: 'Signed DNS record' },
  'well-known': { tone: 'active', label: 'Signed .well-known file' },
  fixture: { tone: 'neutral', label: 'Not proven' },
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="review-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function CompanyRows({ company, legalName }: { readonly company: Company; readonly legalName: string }) {
  return (
    <>
      <Row label="Company">
        <span className="jp" lang="ja">
          {legalName}
        </span>
        {company.fixture ? <Badge tone="info">Fictional</Badge> : <Badge tone="active">NTA exact match</Badge>}
      </Row>
      <Row label="T-number">
        <span className="mono">{company.tNumber}</span>
      </Row>
      <Row label="Payee name">
        <span className="mono">{parseTNumber(company.tNumber)?.ens ?? ''}</span>
      </Row>
    </>
  )
}

/** How the company was found: shown for the reader's check, but not part of what is submitted. */
export function LookupDetails({ company }: { readonly company: Company }) {
  if (!company.address && !company.lei) return null
  return (
    <p className="review-lookup">
      <span className="review-lookup__label">Lookup details, not submitted:</span>{' '}
      {company.address ? (
        <span lang="ja" className="review-lookup__address">
          NTA head office {company.address}
        </span>
      ) : null}
      {company.address && company.lei ? ' · ' : null}
      {company.lei ? (
        <span>
          found by LEI <span className="mono">{company.lei}</span>
        </span>
      ) : null}
    </p>
  )
}

/** Everything the registration submits, as the registry and every ENS client will show it. */
export function SummaryCard({ summary }: { readonly summary: Summary }) {
  const { company, legalName, controller, payout, domain, domainMethod, officers } = summary
  const proof = PROOF[domainMethod ?? '']
  return (
    <dl className="review-card onboard-cell">
      <CompanyRows company={company} legalName={legalName} />
      <Row label="Payout address">
        <Address value={payout} copy />
      </Row>
      <Row label="Business key">
        <Address value={controller} />
      </Row>
      <Row label="Domain">
        <span className="review-domain">{domain ?? 'None'}</span>
        {proof ? <Badge tone={proof.tone}>{proof.label}</Badge> : null}
      </Row>
      <Row label="Officers">{officers}</Row>
    </dl>
  )
}

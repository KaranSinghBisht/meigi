import type { NtaMatch } from '../../../lib/api/lei'
import { unavailable } from '../../../lib/api/messages'
import type { NtaRecord } from '../../../lib/api/verifier'
import { Badge } from '../../../ui/components/Badge'
import { TextField } from '../../../ui/components/Field'
import { ErrorNotice, Notice } from '../../../ui/components/Notice'
import { Spinner } from '../../../ui/components/Spinner'
import type { CompanyLookup } from './useCompanyLookup'

interface CompanyRecordProps {
  readonly lookup: CompanyLookup
  readonly fictionalName: string
  readonly onFictionalName: (name: string) => void
  readonly onPick: (tNumber: string) => void
}

function Looking({ children }: { readonly children: string }) {
  return (
    <p className="company-looking" role="status">
      <Spinner /> {children}
    </p>
  )
}

/** The public NTA record: the exact registered name is what the company registers under. */
function Matched({ record }: { readonly record: NtaRecord }) {
  return (
    <div className="company-record nta-hint">
      <p className="company-record__chips">
        <Badge tone="active">Found in the NTA registry</Badge>
        {record.closed ? <Badge tone="disputed">Closed</Badge> : null}
      </p>
      <p className="company-record__name jp" lang="ja">
        {record.name}
      </p>
      {record.address ? (
        <p className="company-record__address" lang="ja">
          {record.address}
        </p>
      ) : null}
      {record.closed ? (
        <p className="company-record__note">The NTA lists this company as closed, so it can't be registered.</p>
      ) : null}
    </div>
  )
}

interface FictionalProps {
  readonly name: string
  readonly onName: (name: string) => void
}

function Fictional({ name, onName }: FictionalProps) {
  return (
    <div className="company-record company-record--fictional nta-hint">
      <p className="company-record__chips">
        <Badge tone="info">Fictional demo company</Badge>
      </p>
      <p className="company-record__note">
        Registry office 9999 is never issued, so no real company holds this number. Give it a name: Meigi registers
        it, and shows it everywhere, as fictional.
      </p>
      <TextField
        label="Company name"
        lang="ja"
        className="input--jp"
        value={name}
        onChange={(event) => onName(event.target.value)}
        placeholder="株式会社ソラノ精機"
        autoComplete="off"
      />
    </div>
  )
}

interface LeiLinksProps {
  readonly matches: readonly NtaMatch[]
  readonly picked: string | null
  readonly onPick: (tNumber: string) => void
}

/** Rarely, more than one corporation has the LEI's exact name: the reader picks theirs. */
function LeiLinks({ matches, picked, onPick }: LeiLinksProps) {
  if (matches.length < 2) return null
  return (
    <div className="company-picks" role="group" aria-label="Companies with this exact name">
      {matches.map((match) => (
        <button
          key={match.tNumber}
          type="button"
          className="company-pick mono"
          aria-pressed={match.tNumber === picked}
          onClick={() => onPick(match.tNumber)}
        >
          {match.tNumber}
        </button>
      ))}
    </div>
  )
}

/** What GLEIF says about a pasted LEI, and whether it leads to a T-number. Null once the NTA record takes over. */
function LeiStatus({ lookup, onPick }: Pick<CompanyRecordProps, 'lookup' | 'onPick'>) {
  const { lei } = lookup
  if (lookup.kind === 'badLei') {
    return (
      <Notice tone="warn" title="That LEI's check digits don't match.">
        <p>Check it for a typo.</p>
      </Notice>
    )
  }
  if (lei.kind === 'loading') return <Looking>Looking up the LEI with GLEIF…</Looking>
  if (lei.kind === 'failed') return <ErrorNotice error={lei.error} />
  if (lei.kind !== 'done') return null
  if (lookup.matches.length === 0) {
    return (
      <Notice tone="warn" title={`GLEIF lists ${lei.record.legalName}, but no T-number carries exactly that name.`}>
        <p>Enter the company's T-number instead.</p>
      </Notice>
    )
  }
  return (
    <div className="company-lei">
      <p className="company-lei__line">
        LEI <span className="mono">{lei.lei}</span> links to <span className="mono">{lookup.tNumber}</span>
      </p>
      <LeiLinks matches={lookup.matches} picked={lookup.tNumber} onPick={onPick} />
    </div>
  )
}

function NtaStatus({ lookup, fictionalName, onFictionalName }: Omit<CompanyRecordProps, 'onPick'>) {
  const { nta } = lookup
  if (nta.status === 'idle') return null
  if (nta.status === 'loading') return <Looking>Looking it up in the NTA registry…</Looking>
  if (nta.status === 'fixture') return <Fictional name={fictionalName} onName={onFictionalName} />
  if (nta.status === 'found') return <Matched record={nta.record} />
  if (nta.status === 'offline') return <ErrorNotice error={unavailable('verifier')} />
  if (nta.status === 'error') return <Notice tone="warn" title={nta.message} />
  return (
    <Notice tone="warn" title="This number isn't in the NTA registry.">
      <p>Check it for a typo. Sole proprietors are verified by hand, not here.</p>
    </Notice>
  )
}

/** Everything the first step knows about the company, as the reader types. */
export function CompanyRecord(props: CompanyRecordProps) {
  const { lookup } = props
  if (lookup.kind === 'other') {
    return <p className="company-hint">A T-number is T and 13 digits; an LEI is 20 letters and digits.</p>
  }
  return (
    <>
      {lookup.kind === 'lei' || lookup.kind === 'badLei' ? <LeiStatus lookup={lookup} onPick={props.onPick} /> : null}
      <NtaStatus lookup={lookup} fictionalName={props.fictionalName} onFictionalName={props.onFictionalName} />
    </>
  )
}

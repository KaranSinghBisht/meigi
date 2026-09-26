import type { DomainProofChallenge } from '../../../lib/api/verifier'
import { CopyButton } from '../../../ui/components/CopyButton'

function RecordRow({ label, value, copy = true }: { readonly label: string; readonly value: string; readonly copy?: boolean }) {
  return (
    <div className="dns-record__row">
      <span className="dns-record__label">{label}</span>
      <code className="dns-record__value">{value}</code>
      {copy ? <CopyButton value={value} /> : <span aria-hidden="true" />}
    </div>
  )
}

interface ProofRecordsProps {
  readonly challenge: DomainProofChallenge
  readonly signature: string
}

/** Where to publish the signed challenge: a DNS TXT record, or a .well-known file while DNS catches up. */
export function ProofRecords({ challenge, signature }: ProofRecordsProps) {
  const txtValue = `${challenge.txtValuePrefix}${signature}`
  const wellKnown = JSON.stringify({ signature }, null, 2)
  return (
    <>
      <div className="dns-record onboard-cell" role="group" aria-label="DNS TXT record">
        <RecordRow label="Type" value="TXT" copy={false} />
        <RecordRow label="Name" value={challenge.txtName} />
        <RecordRow label="Value" value={txtValue} />
      </div>
      <details className="dns-alt">
        <summary>Can't edit DNS right now? Publish a file instead.</summary>
        <div className="dns-record onboard-cell">
          <RecordRow label="URL" value={challenge.wellKnownUrl} />
          <RecordRow label="Contents" value={wellKnown} />
        </div>
      </details>
    </>
  )
}

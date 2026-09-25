import type { DomainProofChallenge } from '../../lib/api/verifier'
import { CopyButton } from '../../ui/components/CopyButton'
import './register.css'

function CopyRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="copyrow">
      <div className="copyrow__head">
        <span className="field__label">{label}</span>
        <CopyButton value={value} />
      </div>
      <code className="codeblock">{value}</code>
    </div>
  )
}

interface ProofRecordsProps {
  readonly challenge: DomainProofChallenge
  readonly signature: string
}

/** Where to publish the signed challenge: a DNS TXT record, or the .well-known file while DNS propagates. */
export function ProofRecords({ challenge, signature }: ProofRecordsProps) {
  const txtValue = `${challenge.txtValuePrefix}${signature}`
  const wellKnown = JSON.stringify({ signature }, null, 2)
  return (
    <div className="records">
      <section className="records__option" aria-labelledby="dns-title">
        <h3 id="dns-title" className="records__title">
          Option 1 · DNS TXT record
        </h3>
        <CopyRow label="Name" value={challenge.txtName} />
        <CopyRow label="Value" value={txtValue} />
      </section>
      <section className="records__option" aria-labelledby="wk-title">
        <h3 id="wk-title" className="records__title">
          Option 2 · .well-known file
        </h3>
        <CopyRow label="URL" value={challenge.wellKnownUrl} />
        <CopyRow label="Contents" value={wellKnown} />
      </section>
    </div>
  )
}

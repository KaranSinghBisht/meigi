import { addressUrl, shortAddress, shortHash, txUrl } from '../../lib/chain/format'
import { CopyButton } from './CopyButton'
import './data.css'

interface AddressProps {
  readonly value: string
  /** Show the full address (default) or the 0x1234…abcd form. */
  readonly short?: boolean
  readonly copy?: boolean
  readonly link?: boolean
}

/** An address in mono with optional copy and Etherscan link. The full value is always in the title. */
export function Address({ value, short = false, copy = false, link = true }: AddressProps) {
  const text = short ? shortAddress(value) : value
  return (
    <span className="address">
      {link ? (
        <a className="address__value" href={addressUrl(value)} target="_blank" rel="noreferrer" title={value}>
          {text}
          <span className="sr-only"> (opens Etherscan)</span>
        </a>
      ) : (
        <span className="address__value" title={value}>
          {text}
        </span>
      )}
      {copy ? <CopyButton value={value} /> : null}
    </span>
  )
}

/** A transaction hash linking to Sepolia Etherscan. */
export function TxLink({ hash, label }: { readonly hash: string; readonly label?: string }) {
  return (
    <a className="txlink" href={txUrl(hash)} target="_blank" rel="noreferrer" title={hash}>
      {label ?? shortHash(hash)} <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens Sepolia Etherscan)</span>
    </a>
  )
}

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

/** People check an address by its ends, so a full address that doesn't fit is cut in the middle: the head shrinks
    behind an ellipsis and the last six characters always show. Copying the text still copies all of it. */
function FullAddress({ value }: { readonly value: string }) {
  return (
    <>
      <span className="address__head">{value.slice(0, -6)}</span>
      <span className="address__tail">{value.slice(-6)}</span>
    </>
  )
}

/** An address in mono with optional copy and Etherscan link. The full value is always in the title. */
export function Address({ value, short = false, copy = false, link = true }: AddressProps) {
  const text = short ? shortAddress(value) : <FullAddress value={value} />
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

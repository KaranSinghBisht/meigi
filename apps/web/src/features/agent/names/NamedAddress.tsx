import { shortAddress } from '../../../lib/chain/format'
import { useAddressNames } from './AddressNames'
import './names.css'

interface NamedAddressProps {
  readonly address: string
  /** A name the caller already vouches for (a registry name, the vault's primary name); skips the lookup. */
  readonly name?: string | null
  readonly className?: string
}

/**
 * An address shown by its ENS name when it has a verified one, with the full address on hover and for screen
 * readers; the short hex otherwise. Either way it stays on one line.
 */
export function NamedAddress({ address, name, className }: NamedAddressProps) {
  const known = useAddressNames().get(address.toLowerCase())
  const shown = name ?? known ?? null
  const base = className ? `mono ${className}` : 'mono'
  if (!shown) {
    return (
      <span className={base} title={address}>
        {shortAddress(address)}
      </span>
    )
  }
  return (
    <span className={`${base} named`} title={address}>
      {shown}
      <span className="sr-only"> ({shortAddress(address)})</span>
    </span>
  )
}

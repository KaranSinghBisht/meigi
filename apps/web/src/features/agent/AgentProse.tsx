import { useAddressNames, useShortAddressMatch } from './names/AddressNames'
import { NamedAddress } from './names/NamedAddress'

/** A full address, a shortened one (0x9B4f…47e4, or with three dots), or a T-number. */
const TOKEN = /(0x[0-9a-fA-F]{40}|0x[0-9a-fA-F]{2,10}(?:…|\.\.\.)[0-9a-fA-F]{2,10}|T\d{13})/
const FULL = /^0x[0-9a-fA-F]{40}$/
const SHORT = /^0x[0-9a-fA-F]{2,10}(?:…|\.\.\.)[0-9a-fA-F]{2,10}$/

/**
 * Prose from the agent (a kernel check, a hold reason, the worded verdict, the chain's refusal) with every address
 * shown by its verified ENS name when it has one, hex otherwise, and every token kept on one line. A shortened
 * address is named only when exactly one address in the analysis fits it.
 */
export function AgentProse({ text }: { readonly text: string }) {
  const match = useShortAddressMatch()
  const names = useAddressNames()
  const parts = text.split(TOKEN)
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return part
        if (FULL.test(part)) return <NamedAddress key={index} address={part} />
        const full = SHORT.test(part) ? match(part) : null
        if (full && names.has(full)) return <NamedAddress key={index} address={full} />
        // No verified name: the token stays exactly as the agent wrote it.
        return (
          <span key={index} className="nowrap" title={full ?? undefined}>
            {part}
          </span>
        )
      })}
    </>
  )
}

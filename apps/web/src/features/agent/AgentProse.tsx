import { shortAddress } from '../../lib/chain/format'
import { TokenText } from '../../ui/components/TokenText'

/** A full 42-character address: wider than a column, so it is shown short, with the whole value in its tooltip. */
const FULL_ADDRESS = /(0x[0-9a-fA-F]{40})/

/**
 * Prose from the agent (a kernel check, a hold reason, the worded verdict, the chain's refusal) with every address
 * and T-number kept whole: a full address becomes 0x9B4f…47e4, and short ones and T-numbers never break.
 */
export function AgentProse({ text }: { readonly text: string }) {
  const parts = text.split(FULL_ADDRESS)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="nowrap" title={part}>
            {shortAddress(part)}
          </span>
        ) : (
          <TokenText key={index} text={part} />
        ),
      )}
    </>
  )
}

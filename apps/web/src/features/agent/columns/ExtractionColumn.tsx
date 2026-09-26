import type { Extraction } from '../../../lib/api/agentTypes'
import { shortAddress } from '../../../lib/chain/format'
import { Column, Fact } from './Column'
import { FlagList } from './FlagList'

const KINDS: Record<string, string> = {
  invoice: 'Invoice',
  credit_note: 'Credit note',
  x402: 'x402 402-response',
  message: 'Message',
}

export function ExtractionColumn({ extracted }: { readonly extracted: Extraction }) {
  const others = extracted.addresses.filter((a) => a !== extracted.address).length
  const blocking = extracted.flags.some((flag) => flag.severity === 'block')
  return (
    <Column step={1} title="Extraction" tag="deterministic, no model" tone={blocking ? 'hold' : 'neutral'}>
      <p className="col__kind">{KINDS[extracted.kind] ?? extracted.kind}</p>
      <Fact label="T-number">
        <span className="mono col__big-mono" title={extracted.tNumber ?? undefined}>
          {extracted.tNumber ?? '—'}
        </span>
        {extracted.claimedName ? (
          <span className="jp col__claimed" lang="ja">
            {extracted.claimedName}
          </span>
        ) : null}
      </Fact>
      <Fact label="Amount">
        <span className="col__amount">{extracted.amount?.display ?? '—'}</span>
      </Fact>
      <Fact label="Pay to (as printed)">
        {extracted.address ? (
          <span className="mono col__big-mono" title={extracted.address}>
            {shortAddress(extracted.address)}
          </span>
        ) : (
          '—'
        )}
        {others > 0 ? (
          <span className="col__note">
            +{others} more address{others > 1 ? 'es' : ''} in the text
          </span>
        ) : null}
      </Fact>
      {extracted.invoiceNumber ? <Fact label="Invoice">{extracted.invoiceNumber}</Fact> : null}
      <FlagList items={extracted.flags} />
    </Column>
  )
}

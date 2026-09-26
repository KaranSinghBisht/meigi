import { Panel } from '../../ui/components/Panel'
import type { MerchantListing } from './merchants'
import './x402.css'

/** One marketplace listing: static, not a live purchase (see ResearchAgentRun for that). */
export function MerchantCard({ listing }: { readonly listing: MerchantListing }) {
  return (
    <Panel title={listing.title} eyebrow={listing.kind} className="merchant">
      <p className="merchant__body">{listing.body}</p>
      {listing.tNumber ? (
        <dl className="facts merchant__facts">
          <dt>T-number</dt>
          <dd className="mono">{listing.tNumber}</dd>
          <dt>ENS</dt>
          <dd className="mono">{listing.ens}</dd>
        </dl>
      ) : null}
      <p className="merchant__price">{listing.price}</p>
    </Panel>
  )
}

import { MERCHANT_LISTINGS } from './merchants'
import { MerchantCard } from './MerchantCard'
import { ResearchAgentRun } from './ResearchAgentRun'
import './x402.css'

/** The marketplace: who's selling, then a research agent buying from them live. */
export function LiveMerchants() {
  return (
    <>
      <section className="x402__row window" aria-labelledby="listings-title">
        <div className="x402__row-head">
          <h2 id="listings-title" className="x402__row-title">
            Who's selling
          </h2>
          <p className="x402__row-lede">
            Registered merchants declare a T-number and ENS name in the 402 response. The web scrape declares neither.
          </p>
        </div>
        <div className="x402__grid cells">
          {MERCHANT_LISTINGS.map((listing) => (
            <MerchantCard key={listing.id} listing={listing} />
          ))}
        </div>
      </section>
      <ResearchAgentRun />
    </>
  )
}

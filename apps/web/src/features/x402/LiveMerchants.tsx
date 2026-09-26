import { MerchantCard } from './MerchantCard'
import './x402.css'

/** Both kinds of merchant, live against the local x402 demo. */
export function LiveMerchants() {
  return (
    <>
      <section className="x402__row window" aria-labelledby="declared-title">
        <div className="x402__row-head">
          <h2 id="declared-title" className="x402__row-title">
            Merchants that declare a Meigi payee
          </h2>
          <p className="x402__row-lede">
            The registry decides: payTo must be the declared company's registered payout.
          </p>
        </div>
        <div className="x402__grid cells">
          <MerchantCard kind="honest" />
          <MerchantCard kind="compromised" />
        </div>
      </section>
      <section className="x402__row window" aria-labelledby="undeclared-title">
        <div className="x402__row-head">
          <h2 id="undeclared-title" className="x402__row-title">
            Merchants with no Meigi record
          </h2>
          <p className="x402__row-lede">
            No T-number to check, so the agent pays these only small amounts (up to 50 mJPYC), and only after Intercepta
            screens payTo. Here Intercepta alone decides.
          </p>
        </div>
        <div className="x402__grid cells">
          <MerchantCard kind="unverified" />
          <MerchantCard kind="unverified-flagged" />
        </div>
      </section>
    </>
  )
}

import { Link } from 'react-router'
import { WithdrawalCheck } from '../withdrawal-check/WithdrawalCheck'
import './exchanges.css'

/** The FSA and NPA request to crypto-asset exchanges of 6 August 2026 (measure ④): pre-registered destinations. */
const FSA_REQUEST = 'https://www.fsa.go.jp/news/r8/sonota/20260806/20260806.pdf'

const STEPS = [
  'Confirm the address is the registered, undisputed payout for that T-number.',
  'Record the exact registered name with the withdrawal.',
  "Hold the withdrawal when they don't match.",
] as const

/**
 * One use case, told as one window: an exchange checking a withdrawal to a company's payout. What it says Meigi is
 * follows docs/trust-and-compliance.md ("For exchanges and wallets"): a check the payer runs, which helps its own
 * checks and fraud prevention. It is not the travel rule, and no partner is implied.
 */
export function Exchanges() {
  return (
    <section className="biz-window window biz-exchange" aria-labelledby="biz-exchange">
      <header className="biz-window__head">
        <h2 id="biz-exchange" className="biz-window__title">
          Exchanges and wallets
        </h2>
        <p className="biz-window__lede">
          A customer withdraws to an address they say is a company&apos;s payout. Check it before it leaves.
        </p>
      </header>
      <div className="biz-exchange__body">
        <ol className="biz-exchange__steps">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="biz-exchange__text">
          <p>
            It fits the FSA and NPA request of 6 August 2026 for pre-registered withdrawal destinations, checked for
            links to fraud (
            <a href={FSA_REQUEST} target="_blank" rel="noreferrer">
              the request, in Japanese <span aria-hidden="true">↗</span>
            </a>
            ). Wallets can run the same check before signing, through the <Link to="/registry">registry</Link> or ENS.
          </p>
          <p className="biz-exchange__limits">
            It helps the exchange&apos;s own checks and fraud prevention. It doesn&apos;t satisfy the travel rule, and
            it doesn&apos;t replace the exchange&apos;s own collection, screening or risk assessment.
          </p>
        </div>
      </div>
      <div id="withdrawal-check" className="biz-exchange__check">
        <WithdrawalCheck />
      </div>
    </section>
  )
}

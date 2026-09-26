import { env } from '../../lib/env/env'
import { HankoMark } from '../../ui/brand/HankoMark'
import { ExternalLinkButton } from '../../ui/components/Button'
import '../../ui/layout/layout.css'
import { Exchanges } from './Exchanges'
import { LeiWidget } from './LeiWidget'
import { Pricing, Products, Roadmap, WhyNow } from './Sections'
import './business.css'

function TalkToUs() {
  return (
    <section className="biz-cta" aria-labelledby="biz-cta">
      <HankoMark size={56} />
      <div className="biz-cta__text">
        <h2 id="biz-cta" className="biz-cta__title">
          Pay companies, not addresses.
        </h2>
        <p className="biz-cta__body">
          Payers, wallets, stablecoin issuers and agent platforms: tell us what you pay, and who you pay.
        </p>
      </div>
      <div className="biz-cta__actions">
        <a className="btn btn--primary btn--lg" href={`mailto:${env.contactEmail}?subject=Meigi`}>
          Talk to us
        </a>
        {env.githubUrl ? (
          <ExternalLinkButton href={env.githubUrl} variant="ghost" size="lg">
            Read the code <span aria-hidden="true">↗</span>
          </ExternalLinkButton>
        ) : null}
      </div>
    </section>
  )
}

/** Meigi as a product: static copy over the world, at the shore. */
export default function BusinessPage() {
  return (
    <div className="biz">
      <header className="page-head">
        <p className="eyebrow">
          <span className="jp biz__jp">名義</span> For business
        </p>
        <h1 className="page-head__title">Confirmation of Payee for stablecoins and AI agents.</h1>
        <p className="page-head__lede">Japan first, global by design.</p>
      </header>
      <Products />
      <Exchanges />
      <WhyNow />
      <Roadmap />
      <LeiWidget />
      <Pricing />
      <TalkToUs />
    </div>
  )
}

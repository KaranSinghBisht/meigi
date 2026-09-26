import { useEffect } from 'react'
import { useLocation } from 'react-router'
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
/**
 * A link like /business#withdrawal-check lands on its section. It waits a frame, so it runs after the app shell's own
 * scroll-to-top for a new page.
 */
function useHashTarget() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hash])
}

export default function BusinessPage() {
  useHashTarget()
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

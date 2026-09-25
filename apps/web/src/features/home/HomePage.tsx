import { Link } from 'react-router'
import { env } from '../../lib/env/env'
import { VerticalLabel } from '../../ui/brand/VerticalLabel'
import { LinkButton } from '../../ui/components/Button'
import { FixtureStrip } from './FixtureStrip'
import './home.css'

const FLOWS = [
  {
    to: '/registry',
    kanji: '台帳',
    title: 'Registry explorer',
    body: 'Look up any T-number: the company, the one address it can be paid at, and anything pending.',
  },
  {
    to: '/register',
    kanji: '登録',
    title: 'Register a business',
    body: 'Exact NTA name match, a signed DNS proof, then World ID for each officer. Written on-chain.',
  },
  {
    to: '/change',
    kanji: '変更',
    title: 'Company changes',
    body: 'New payout or a lost key: the business key plus the same verified humans, then 72 hours in public.',
  },
  {
    to: '/x402',
    kanji: '決済',
    title: 'x402 guard',
    body: 'An agent buying an API refuses to sign when a hacked merchant swaps the payTo address.',
  },
] as const

function Hero() {
  return (
    <section className="home__hero" aria-labelledby="home-title">
      <div className="home__hero-text">
        <p className="eyebrow">
          <span className="jp home__jp">名義</span> Confirmation of Payee for stablecoins and AI agents
        </p>
        <h1 id="home-title" className="home__title">
          Pay companies, not addresses.
        </h1>
        <p className="home__lede">
          Every Japanese business has a public T-number. Meigi binds it to one payout address, which only the company's
          same verified humans can change, in public, over 72 hours. An AI agent can be talked into wanting to pay a
          scammer. The chain still refuses.
        </p>
        <FixtureStrip />
      </div>
      <VerticalLabel />
    </section>
  )
}

function DemoCallout() {
  return (
    <section className="home__feature" aria-labelledby="home-agent">
      <div>
        <p className="eyebrow">The demo</p>
        <h2 id="home-agent" className="home__feature-title">
          “Please try to rob our AI accountant.”
        </h2>
        <p className="home__feature-body">
          {env.hosted
            ? 'The agent runs on our demo machine. See a recorded run: it believed a bank-change email, and the vault refused to pay anyone but the registered company.'
            : 'Paste a fake invoice, a bank-change email or a prompt injection. Watch the agent believe it, and the vault refuse to pay anyone but the registered company.'}
        </p>
      </div>
      <LinkButton to="/agent" variant="accent" size="lg">
        {env.hosted ? 'See the recorded run' : 'Open the agent console'} <span aria-hidden="true">→</span>
      </LinkButton>
    </section>
  )
}

function FlowCards() {
  return (
    <ul className="home__flows" aria-label="Other flows">
      {FLOWS.map((flow) => (
        <li key={flow.to}>
          <Link to={flow.to} className="flow-card">
            <span className="flow-card__kanji jp" aria-hidden="true">
              {flow.kanji}
            </span>
            <span className="flow-card__title">
              {flow.title} <span aria-hidden="true">→</span>
            </span>
            <span className="flow-card__body">{flow.body}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function HomePage() {
  return (
    <div className="home">
      <Hero />
      <DemoCallout />
      <FlowCards />
    </div>
  )
}

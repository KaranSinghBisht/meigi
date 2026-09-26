import { Link } from 'react-router'
import { Badge, type BadgeTone } from '../../ui/components/Badge'
import { LEI_NOTE, PRODUCTS, ROADMAP, TIERS, WHY_NOW, type Milestone, type Product } from './content'
import './business.css'

function ProductCard({ product, index }: { readonly product: Product; readonly index: number }) {
  return (
    <li className="biz-product">
      <p className="biz-product__kanji jp" lang="ja" aria-hidden="true">
        {product.kanji}
      </p>
      <h3 className="biz-product__name">
        <span className="biz-product__index">{index + 1}</span> {product.name}
      </h3>
      <p className="biz-product__body">{product.body}</p>
      <p className="biz-product__model">{product.model}</p>
      {product.demo ? (
        <Link to={product.demo.to} className="biz-product__demo">
          {product.demo.label} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </li>
  )
}

export function Products() {
  return (
    <section className="biz-window window" aria-labelledby="biz-products">
      <header className="biz-window__head">
        <h2 id="biz-products" className="biz-window__title">
          Five products, one registry
        </h2>
      </header>
      <ol className="biz-products cells">
        {PRODUCTS.map((product, index) => (
          <ProductCard key={product.name} product={product} index={index} />
        ))}
      </ol>
    </section>
  )
}

export function Pricing() {
  return (
    <section className="biz-window window" aria-labelledby="biz-pricing">
      <header className="biz-window__head">
        <h2 id="biz-pricing" className="biz-window__title">
          Pricing <Badge tone="neutral">Illustrative</Badge>
        </h2>
        <p className="biz-window__lede">Placeholder tiers to show the shape of the offer. No prices yet.</p>
      </header>
      <ul className="biz-tiers cells">
        {TIERS.map((tier) => (
          <li key={tier.name} className="biz-tier">
            <h3 className="biz-tier__name">{tier.name}</h3>
            <p className="biz-tier__who">{tier.who}</p>
            <ul className="biz-tier__items">
              {tier.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}

const STATUS: Record<Milestone['status'], { label: string; tone: BadgeTone }> = {
  now: { label: 'Now', tone: 'active' },
  'in progress': { label: 'In progress', tone: 'pending' },
  next: { label: 'Next', tone: 'neutral' },
}

export function Roadmap() {
  return (
    <section className="biz-window window" aria-labelledby="biz-roadmap">
      <header className="biz-window__head">
        <h2 id="biz-roadmap" className="biz-window__title">
          Japan first, global by design
        </h2>
      </header>
      <ol className="biz-roadmap cells">
        {ROADMAP.map((step) => (
          <li key={step.id} className="biz-step">
            <Badge tone={STATUS[step.status].tone}>{STATUS[step.status].label}</Badge>
            <p className="biz-step__name">{step.name}</p>
            <p className="biz-step__detail">{step.detail}</p>
          </li>
        ))}
      </ol>
      <p className="biz-window__foot">{LEI_NOTE}</p>
    </section>
  )
}

export function WhyNow() {
  return (
    <section className="biz-window window" aria-labelledby="biz-why">
      <header className="biz-window__head">
        <h2 id="biz-why" className="biz-window__title">
          Why now
        </h2>
      </header>
      <ul className="biz-why cells">
        {WHY_NOW.map((fact) => (
          <li key={fact.title} className="biz-fact">
            <h3 className="biz-fact__title">{fact.title}</h3>
            <p className="biz-fact__body">{fact.body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

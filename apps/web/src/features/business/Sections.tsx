import { Link } from 'react-router'
import { Badge } from '../../ui/components/Badge'
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
    <section className="biz-section" aria-labelledby="biz-products">
      <h2 id="biz-products" className="biz-section__title on-scene">
        Five products, one registry
      </h2>
      <ol className="biz-products">
        {PRODUCTS.map((product, index) => (
          <ProductCard key={product.name} product={product} index={index} />
        ))}
      </ol>
    </section>
  )
}

export function Pricing() {
  return (
    <section className="biz-section" aria-labelledby="biz-pricing">
      <div className="biz-section__head on-scene">
        <h2 id="biz-pricing" className="biz-section__title">
          Pricing <Badge tone="neutral">Illustrative</Badge>
        </h2>
        <p className="biz-section__lede">Placeholder tiers to show the shape of the offer. No prices yet.</p>
      </div>
      <ul className="biz-tiers">
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

const STATUS_LABEL: Record<Milestone['status'], string> = { now: 'Now', 'in progress': 'In progress', next: 'Next' }

export function Roadmap() {
  return (
    <section className="biz-section" aria-labelledby="biz-roadmap">
      <h2 id="biz-roadmap" className="biz-section__title on-scene">
        Japan first, global by design
      </h2>
      <ol className="biz-roadmap">
        {ROADMAP.map((step) => (
          <li key={step.id} className={`biz-step biz-step--${step.status.replace(' ', '-')}`}>
            <p className="biz-step__status">{STATUS_LABEL[step.status]}</p>
            <p className="biz-step__name">{step.name}</p>
            <p className="biz-step__detail">{step.detail}</p>
          </li>
        ))}
      </ol>
      <p className="biz-roadmap__note">{LEI_NOTE}</p>
    </section>
  )
}

export function WhyNow() {
  return (
    <section className="biz-section" aria-labelledby="biz-why">
      <h2 id="biz-why" className="biz-section__title on-scene">
        Why now
      </h2>
      <ul className="biz-why">
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

import { shortHash } from '../../../../lib/chain/format'
import { X402_RUN, type X402Purchase } from '../../content/x402'
import { Card, Chip } from './parts'

const MARK = { pass: '✓', fail: '✗', skip: '–' } as const

function Outcome({ purchase }: { readonly purchase: X402Purchase }) {
  const { outcome } = purchase
  if (outcome.status === 'refused') {
    return (
      <p className="pcard__row pcard__row--top" data-d={`x-${purchase.id}-outcome`} data-enter="">
        <Chip tone="bad">Refused before signing</Chip>
        <span className="pcard__note">{outcome.reason}</span>
      </p>
    )
  }
  return (
    <p className="pcard__row" data-d={`x-${purchase.id}-outcome`} data-enter="">
      <Chip tone="ok">Signed · settled</Chip>
      <span className="pcard__note">
        {purchase.price}
        {outcome.txHash ? (
          <>
            {' '}
            · tx <span className="mono">{shortHash(outcome.txHash)}</span>
          </>
        ) : null}
      </span>
    </p>
  )
}

function PurchaseCard({ purchase, index }: { readonly purchase: X402Purchase; readonly index: number }) {
  return (
    <Card
      name={`x-card-${purchase.id}`}
      title={`${index + 1} · ${purchase.merchant}`}
      meta={`${purchase.item} · ${purchase.price}`}
    >
      <p className="pcard__row">
        {purchase.declared ? (
          <span className="mono ptoken">{purchase.declared.ens}</span>
        ) : (
          <span className="pcard__note">No payee declared</span>
        )}
      </p>
      <ul className="pchecks">
        {purchase.checks.map((check, i) => (
          <li
            key={check.label}
            className={`pcheck pcheck--${check.state}`}
            data-d={`x-${purchase.id}-check-${i}`}
            data-enter=""
          >
            <span className="pcheck__mark" aria-hidden="true">
              {MARK[check.state]}
            </span>
            <span className="pcheck__label">{check.label}</span>
            <span className="pcheck__detail">{check.detail}</span>
          </li>
        ))}
      </ul>
      <Outcome purchase={purchase} />
    </Card>
  )
}

export function X402Cards() {
  return (
    <>
      {X402_RUN.placeholder ? (
        <p className="pplaceholder" data-d="x-placeholder">
          Placeholder run: the recorded research-agent run replaces it.
        </p>
      ) : null}
      {X402_RUN.purchases.map((purchase, index) => (
        <PurchaseCard key={purchase.id} purchase={purchase} index={index} />
      ))}
    </>
  )
}

import type { GuardVerdictView, Purchase } from '../../lib/api/merchant'
import { Address, TxLink } from '../../ui/components/Address'
import { Notice } from '../../ui/components/Notice'
import { useSceneMood } from '../../ui/stage/useSceneMood'
import { InterceptaScreen } from './InterceptaScreen'
import './x402.css'

const REFUSALS: Record<string, string> = {
  payto_mismatch: "Refused before signing: payTo isn't the company's registered payout.",
  payee_not_active: 'Refused before signing: the declared company is not an active payee.',
  screened: 'Refused before signing: Intercepta flagged the payTo address.',
  screening_unavailable: 'Refused: no Meigi record, and the Intercepta screen failed.',
  unverified_over_limit: 'Refused: no Meigi record, and the amount is over the small unverified limit.',
  no_declaration: 'Refused: no Meigi record, and no screening is configured.',
  invalid_declaration: "Refused: the merchant's payee declaration is malformed.",
  network_mismatch: 'Refused: the payment is on a network the registry does not vouch for.',
}

interface PurchaseResultProps {
  readonly purchase: Purchase
  /** A recorded purchase is shown, not announced. */
  readonly recorded?: boolean
}

function Screen({ verdict }: { readonly verdict: GuardVerdictView }) {
  return verdict.screening ? <InterceptaScreen {...verdict.screening} /> : null
}

function Refused({ verdict, recorded }: { readonly verdict: GuardVerdictView; readonly recorded: boolean }) {
  return (
    <div className="purchase">
      <Notice tone="denied" title={REFUSALS[verdict.code ?? ''] ?? 'Refused before signing.'} quiet={recorded}>
        {verdict.reason ? <p>{verdict.reason}</p> : null}
        <p>Nothing was signed, so nothing can be settled.</p>
      </Notice>
      <Screen verdict={verdict} />
    </div>
  )
}

function title(purchase: Purchase, verdict: GuardVerdictView): string {
  if (verdict.unverified) {
    return purchase.paid
      ? 'Paid: unverified merchant, small amount, Intercepta screen clean.'
      : 'Intercepta screen clean, but the purchase did not complete.'
  }
  return purchase.paid ? 'Guard passed. Paid and settled.' : 'Guard passed, but the purchase did not complete.'
}

export function PurchaseResult({ purchase, recorded = false }: PurchaseResultProps) {
  useSceneMood(!recorded && purchase.paid ? 'ok' : null)
  const verdict = purchase.verdict
  if (verdict && !verdict.ok) return <Refused verdict={verdict} recorded={recorded} />
  if (!verdict) {
    return (
      <Notice tone="warn" title="The guard didn't run: the purchase failed before the 402 was checked.">
        <p>The buyer service reported an error; its log has the details.</p>
      </Notice>
    )
  }
  return (
    <div className="purchase">
      <Notice quiet={recorded} tone={purchase.paid ? 'success' : 'warn'} title={title(purchase, verdict)}>
        <Payee verdict={verdict} />
        {purchase.txHash ? (
          <p>
            Settlement <TxLink hash={purchase.txHash} />
          </p>
        ) : null}
        {!purchase.paid ? <p>The buyer service reported an error; its log has the details.</p> : null}
      </Notice>
      <Screen verdict={verdict} />
    </div>
  )
}

function Payee({ verdict }: { readonly verdict: GuardVerdictView }) {
  const payTo = verdict.payTo ? <Address value={verdict.payTo} short /> : null
  if (!verdict.legalName) return payTo ? <p>payTo {payTo} (no Meigi record)</p> : null
  return (
    <p>
      <span className="mono">{verdict.tNumber}</span> ={' '}
      <span className="jp" lang="ja">
        {verdict.legalName}
      </span>
      {payTo ? <> · payTo {payTo}</> : null}
    </p>
  )
}

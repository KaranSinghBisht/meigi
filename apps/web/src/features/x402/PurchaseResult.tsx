import type { GuardVerdictView, Purchase } from '../../lib/api/merchant'
import { Address, TxLink } from '../../ui/components/Address'
import { Notice } from '../../ui/components/Notice'
import './x402.css'

const REFUSALS: Record<string, string> = {
  payto_mismatch: "Refused before signing: payTo isn't the company's registered payout.",
  payee_not_active: 'Refused before signing: the declared company is not an active payee.',
  screened: 'Refused before signing: screening flagged the payTo address.',
  no_declaration: "Refused: the merchant doesn't declare a Meigi-verified payee.",
  invalid_declaration: "Refused: the merchant's payee declaration is malformed.",
  network_mismatch: 'Refused: the payment is on a network the registry does not vouch for.',
}

export function PurchaseResult({ purchase }: { readonly purchase: Purchase }) {
  const verdict = purchase.verdict
  if (verdict && !verdict.ok) {
    return (
      <div className="purchase">
        <Notice tone="denied" title={REFUSALS[verdict.code ?? ''] ?? 'Refused before signing.'}>
          {verdict.reason ? <p>{verdict.reason}</p> : null}
          <p>Nothing was signed, so nothing can be settled.</p>
        </Notice>
        {verdict.screening ? (
          <Screening flagged={verdict.screening.flagged} summary={verdict.screening.summary} />
        ) : null}
      </div>
    )
  }
  if (!verdict) {
    return (
      <Notice tone="warn" title="The guard didn't run: the purchase failed before the 402 was checked.">
        <p>The buyer service reported an error; its log has the details.</p>
      </Notice>
    )
  }
  return (
    <div className="purchase">
      <Notice
        tone={purchase.paid ? 'success' : 'warn'}
        title={purchase.paid ? 'Guard passed. Paid and settled.' : 'Guard passed, but the purchase did not complete.'}
      >
        <Payee verdict={verdict} />
        {purchase.txHash ? (
          <p>
            Settlement <TxLink hash={purchase.txHash} />
          </p>
        ) : null}
        {!purchase.paid ? <p>The buyer service reported an error; its log has the details.</p> : null}
      </Notice>
      {verdict.screening ? <Screening flagged={verdict.screening.flagged} summary={verdict.screening.summary} /> : null}
    </div>
  )
}

function Payee({ verdict }: { readonly verdict: GuardVerdictView }) {
  if (!verdict.legalName) return null
  return (
    <p>
      <span className="mono">{verdict.tNumber}</span> ={' '}
      <span className="jp" lang="ja">
        {verdict.legalName}
      </span>
      {verdict.payTo ? (
        <>
          {' '}
          · payTo <Address value={verdict.payTo} short />
        </>
      ) : null}
    </p>
  )
}

function Screening({ flagged, summary }: { readonly flagged: boolean; readonly summary: string }) {
  return (
    <p className={flagged ? 'purchase__screen purchase__screen--flagged' : 'purchase__screen'}>
      Screening: {flagged ? 'flagged' : 'clear'}
      {summary ? ` · ${summary}` : ''}
    </p>
  )
}

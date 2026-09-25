import { useState } from 'react'
import { explainError, type Explained } from '../../lib/api/messages'
import { runPurchase, type MerchantKind, type Purchase } from '../../lib/api/merchant'
import { Button } from '../../ui/components/Button'
import { ErrorNotice } from '../../ui/components/Notice'
import { Panel } from '../../ui/components/Panel'
import { MERCHANTS } from './merchants'
import { PurchaseResult } from './PurchaseResult'
import './x402.css'

type RunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly purchase: Purchase }
  | { readonly status: 'failed'; readonly error: Explained }

/** One live purchase through the local x402 demo. */
export function MerchantCard({ kind }: { readonly kind: MerchantKind }) {
  const [state, setState] = useState<RunState>({ status: 'idle' })
  const copy = MERCHANTS[kind]

  const run = async () => {
    setState({ status: 'running' })
    try {
      setState({ status: 'done', purchase: await runPurchase(kind) })
    } catch (error) {
      setState({ status: 'failed', error: explainError(error, 'merchant') })
    }
  }

  return (
    <Panel title={copy.title} eyebrow={copy.eyebrow} className={`merchant merchant--${kind}`}>
      <p className="merchant__body">{copy.body}</p>
      <Button
        variant={kind === 'compromised' || kind === 'unverified-flagged' ? 'accent' : 'primary'}
        size="lg"
        busy={state.status === 'running'}
        onClick={() => void run()}
      >
        {state.status === 'running' ? 'Buying…' : copy.button}
      </Button>
      {state.status === 'running' ? <p className="merchant__progress">{copy.progress}</p> : null}
      <div className="merchant__result" aria-live="polite">
        {state.status === 'done' ? <PurchaseResult purchase={state.purchase} /> : null}
        {state.status === 'failed' ? <ErrorNotice error={state.error} /> : null}
      </div>
    </Panel>
  )
}

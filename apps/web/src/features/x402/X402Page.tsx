import { useState } from 'react'
import { explainError, type Explained } from '../../lib/api/messages'
import { runPurchase, type MerchantKind, type Purchase } from '../../lib/api/merchant'
import { env } from '../../lib/env/env'
import { Button } from '../../ui/components/Button'
import { ErrorNotice } from '../../ui/components/Notice'
import { Panel } from '../../ui/components/Panel'
import { PurchaseResult } from './PurchaseResult'
import '../../ui/layout/layout.css'
import './x402.css'

type RunState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly purchase: Purchase }
  | { readonly status: 'failed'; readonly error: Explained }

const MERCHANTS: Record<MerchantKind, { title: string; body: string; button: string }> = {
  honest: {
    title: 'Honest merchant',
    body: "The 402 response asks the agent to pay the merchant's registered payout, and declares its T-number.",
    button: 'Buy from honest merchant',
  },
  compromised: {
    title: 'Compromised merchant',
    body: "Same merchant, same T-number, but its server was hacked and the 402's payTo now points at the attacker.",
    button: 'Buy from compromised merchant',
  },
}

function MerchantCard({ kind }: { readonly kind: MerchantKind }) {
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
    <Panel
      title={copy.title}
      eyebrow={kind === 'honest' ? 'payTo = registered payout' : 'payTo swapped'}
      className={`merchant merchant--${kind}`}
    >
      <p className="merchant__body">{copy.body}</p>
      <Button
        variant={kind === 'honest' ? 'primary' : 'accent'}
        size="lg"
        busy={state.status === 'running'}
        onClick={() => void run()}
      >
        {state.status === 'running' ? 'Buying…' : copy.button}
      </Button>
      <div className="merchant__result" aria-live="polite">
        {state.status === 'done' ? <PurchaseResult purchase={state.purchase} /> : null}
        {state.status === 'failed' ? <ErrorNotice error={state.error} /> : null}
      </div>
    </Panel>
  )
}

export default function X402Page() {
  return (
    <div className="x402">
      <header className="page-head">
        <p className="eyebrow">x402 guard</p>
        <h1 className="page-head__title">A hacked merchant can't redirect the payment.</h1>
        <p className="page-head__lede">
          An AI agent buys JPY/USD data from an API that charges 10 mJPYC per call over x402. The merchant declares its
          T-number in the 402 response. Before the agent signs, <code>@meigi/x402-guard</code> checks <code>payTo</code>{' '}
          against the registry. An attacker can edit a web server, not the company's registry entry.
        </p>
      </header>
      <div className="x402__grid">
        <MerchantCard kind="honest" />
        <MerchantCard kind="compromised" />
      </div>
      <Panel title="Add the guard to any x402 client" eyebrow="Two lines" className="x402__code">
        <pre className="codeblock">
          {`import { meigiPayeeExtension, requireMeigiPayee, registryReader } from '@meigi/x402-guard'

client
  .registerExtension(meigiPayeeExtension({ network: 'eip155:11155111', payee: registryReader(publicClient, registry) }))
  .onBeforePaymentCreation(requireMeigiPayee())`}
        </pre>
        <p className="muted">
          Demo service: <code>{env.merchantUrl}</code> (<code>/demo/honest</code>, <code>/demo/compromised</code>).
        </p>
      </Panel>
    </div>
  )
}

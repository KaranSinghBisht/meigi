import { env } from '../../lib/env/env'
import { Panel } from '../../ui/components/Panel'
import { ServiceGate } from '../../ui/demo/ServiceGate'
import { LiveMerchants } from './LiveMerchants'
import { X402Hosted } from './X402Hosted'
import '../../ui/layout/layout.css'
import './x402.css'

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
      <ServiceGate service="merchant" fallback={<X402Hosted />}>
        <LiveMerchants />
      </ServiceGate>
      <Panel
        title="Add the guard to any x402 client"
        eyebrow="Registry first, Intercepta for the rest"
        className="x402__code"
      >
        <pre className="codeblock">
          {`import { interceptaScreen, meigiPayeeExtension, registryReader, screenUndeclaredPayee } from '@meigi/x402-guard'

client
  .registerExtension(meigiPayeeExtension({ network: 'eip155:11155111', payee: registryReader(publicClient, registry) }))
  .onBeforePaymentCreation(screenUndeclaredPayee({ screen: interceptaScreen({ apiKey }), maxAmount: 50n * 10n ** 18n }))`}
        </pre>
        <p className="muted">
          Demo service: <code>{env.merchantUrl}</code> (<code>/demo/honest</code>, <code>/demo/compromised</code>,{' '}
          <code>/demo/unverified</code>, <code>/demo/unverified-flagged</code>).
        </p>
      </Panel>
    </div>
  )
}

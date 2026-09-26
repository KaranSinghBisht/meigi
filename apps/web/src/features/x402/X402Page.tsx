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
        <p className="eyebrow">Agentic commerce</p>
        <h1 className="page-head__title">Agents buy compute and data. Meigi checks who they pay.</h1>
        <p className="page-head__lede">
          Registered merchants declare a T-number and ENS name in the 402 response, over x402. Before an agent signs,{' '}
          <code>@meigi/x402-guard</code> checks <code>payTo</code> against both, independently, and refuses if either
          disagrees. A compromised server can edit its own <code>payTo</code>; it can't touch the company's registry
          entry or its ENS name. One merchant here deliberately declares neither, so you can see the guard fall back to
          screening <code>payTo</code>.
        </p>
      </header>
      <ServiceGate service="merchant" fallback={<X402Hosted />}>
        <LiveMerchants />
      </ServiceGate>
      <Panel
        title="Add the guard to any x402 client"
        eyebrow="Registry and ENS, independently; Intercepta for the rest"
        className="x402__code"
      >
        <pre className="codeblock">
          {`import { ensResolver, interceptaScreen, registerMeigiGuard, registryReader } from '@meigi/x402-guard'

registerMeigiGuard(client, {
  network: 'eip155:11155111',
  payee: registryReader(publicClient, registry),
  resolveEns: ensResolver(publicClient),
}, {
  // Merchants that declare a T-number are checked against the registry above. registerMeigiGuard also
  // requires this: without it, a merchant that declares nothing would be paid with no check at all.
  undeclared: { screen: interceptaScreen({ apiKey }), maxAmount: 50n * 10n ** 18n },
})`}
        </pre>
        <p className="muted">
          <code>@meigi/x402-guard</code> is a workspace package in the Meigi repo; it's not published to npm yet.
        </p>
        <p className="muted">
          Demo service: <code>{env.merchantUrl}</code> (<code>POST /scenario/research-agent</code>).
        </p>
      </Panel>
    </div>
  )
}

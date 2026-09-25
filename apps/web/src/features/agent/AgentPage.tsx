import { env } from '../../lib/env/env'
import { ServiceGate } from '../../ui/demo/ServiceGate'
import { AgentHosted } from './AgentHosted'
import { AgentLive } from './AgentLive'
import './agent.css'

export default function AgentPage() {
  return (
    <div className="agent">
      <header className="agent__head">
        <div>
          <p className="eyebrow">AP agent console</p>
          <h1 className="agent__title">Please try to rob our AI accountant.</h1>
          <p className="agent__lede">
            {env.hosted
              ? 'It pays our suppliers in JPYC from an AgentVault. Below is a real run: a bank-change email the agent believed, and the chain refused.'
              : 'It pays our suppliers in JPYC from an AgentVault. Paste a fake invoice, a bank-change email or a prompt injection. The agent may believe it. The chain decides.'}
          </p>
        </div>
      </header>
      <ServiceGate service="agent" fallback={<AgentHosted />}>
        <AgentLive />
      </ServiceGate>
    </div>
  )
}

import { env } from '../../lib/env/env'
import { ServiceGate } from '../../ui/demo/ServiceGate'
import { AgentHosted } from './AgentHosted'
import { AgentLive } from './AgentLive'
import './agent.css'

export default function AgentPage() {
  return (
    <div className="agent">
      <header className="agent__head">
        <div className="on-scene agent__head-text">
          <p className="eyebrow">
            AP agent · <span className="agent__ens">ap.meigi.eth</span>
          </p>
          <h1 className="agent__title">It reads every invoice. It only pays verified companies.</h1>
          <p className="agent__lede">
            {env.hosted
              ? 'The agent may believe a scam. The vault only pays the address registered to the company. Below, real runs replayed from Sepolia.'
              : 'Drop in an invoice, a supplier email or an x402 request. The agent may believe a scam. The vault only pays the address registered to the company.'}
          </p>
        </div>
      </header>
      <ServiceGate service="agent" fallback={<AgentHosted />}>
        <AgentLive />
      </ServiceGate>
    </div>
  )
}

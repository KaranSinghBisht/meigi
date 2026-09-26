import { unavailable } from '../../lib/api/messages'
import { ErrorNotice } from '../../ui/components/Notice'
import { SettlementsPanel } from '../settlements/SettlementsPanel'
import { Results } from './AgentResults'
import { InvoiceInput } from './InvoiceInput'
import { useAgentConsole } from './useAgentConsole'
import { VaultPanel } from './VaultPanel'
import './agent.css'

function AgentOffline() {
  const offline = unavailable('agent')
  return <ErrorNotice error={{ ...offline, detail: `${offline.detail} The examples below are built in until then.` }} />
}

/**
 * The live console, laid out as a dashboard: the document to check beside the vault it would be paid from, then
 * the result. Only mounted when the agent can be used from this page.
 */
export function AgentLive() {
  const agent = useAgentConsole()
  return (
    <>
      <div className="agent-board">
        <div className="agent-board__main">
          {agent.examples.offline ? <AgentOffline /> : null}
          <InvoiceInput agent={agent} />
        </div>
        <aside className="agent-board__side" aria-label="The vault the agent pays from">
          <VaultPanel version={agent.payments} />
        </aside>
      </div>
      <Results agent={agent} />
      <SettlementsPanel />
    </>
  )
}

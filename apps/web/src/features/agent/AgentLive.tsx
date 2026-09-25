import { unavailable } from '../../lib/api/messages'
import { ErrorNotice } from '../../ui/components/Notice'
import { Results } from './AgentResults'
import { InvoiceInput } from './InvoiceInput'
import { useAgentConsole } from './useAgentConsole'
import { VaultStrip } from './VaultStrip'
import './agent.css'

function AgentOffline() {
  const offline = unavailable('agent')
  return <ErrorNotice error={{ ...offline, detail: `${offline.detail} The examples below are built in until then.` }} />
}

/** The live console: only mounted when the agent can be used from this page. */
export function AgentLive() {
  const agent = useAgentConsole()
  return (
    <>
      <VaultStrip version={agent.payments} />
      {agent.examples.offline ? <AgentOffline /> : null}
      <InvoiceInput agent={agent} />
      <Results agent={agent} />
    </>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { readVaultAgent, type VaultAgent } from '../../lib/chain/names'
import { tNumberFromValue } from '../../lib/chain/tNumber'

/** The vault's agent, read live: its key, or the MandateGate that obeys an ENS name. Null until read, or if it can't be. */
function useVaultAgent(): VaultAgent | null {
  const [agent, setAgent] = useState<VaultAgent | null>(null)
  useEffect(() => {
    let live = true
    readVaultAgent().then(
      (next) => {
        if (live) setAgent(next)
      },
      (error: unknown) => reportError(error), // the note then says only what is true either way
    )
    return () => {
      live = false
    }
  }, [])
  return agent
}

/**
 * The public site's one line on where the live agent runs, true whichever way the vault takes orders: through its
 * ENS mandate gate (named, and linked to the company that issued it), or straight from the agent key after a rollback.
 */
export function AgentNote() {
  const agent = useVaultAgent()
  if (agent?.kind === 'mandate') {
    const company = tNumberFromValue(agent.principal)
    return (
      <p className="agent__note">
        The live agent runs on our own machine, with the signer that holds its key; it pays only through the
        vault&apos;s ENS mandate, <Link to={`/registry/${company.display}`}>{`${agent.label}.${company.ens}`}</Link>.
      </p>
    )
  }
  const key = agent?.kind === 'key' ? "the vault's agent key" : 'its key'
  return <p className="agent__note">The live agent runs on our own machine, with the signer that holds {key}.</p>
}

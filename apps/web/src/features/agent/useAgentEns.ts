import { useEffect, useState } from 'react'
import { publicClient } from '../../lib/chain/client'
import { env } from '../../lib/env/env'

/** The AP agent's own ENS name (ENSv2, under meigi.eth). */
export const AGENT_ENS_NAME = 'ap.meigi.eth'

export interface AgentEns {
  /** The vault's primary (reverse) name is the agent's name: `getEnsName(vault)` answers ap.meigi.eth. */
  readonly primary: boolean | null
  /** The agent's own `agent-status` text record ("online"), which only its key may set. */
  readonly status: string | null
}

/** Reads, through stock ENS, whether the vault's primary name is the agent's and what status the agent reports. */
export function useAgentEns(): AgentEns {
  const [ens, setEns] = useState<AgentEns>({ primary: null, status: null })
  useEffect(() => {
    let live = true
    void Promise.all([
      publicClient.getEnsName({ address: env.vault }).catch(() => null),
      publicClient.getEnsText({ name: AGENT_ENS_NAME, key: 'agent-status' }).catch(() => null),
    ]).then(([name, status]) => {
      if (live) setEns({ primary: name === null ? null : name === AGENT_ENS_NAME, status: status || null })
    })
    return () => {
      live = false
    }
  }, [])
  return ens
}

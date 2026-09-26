import { AGENT_ENS_NAME, useAgentEns } from '../agent/useAgentEns'
import { useVault } from '../agent/useVault'

export interface VaultBalance {
  /** Formatted like "4,944,000". */
  readonly amount: string
  /** The vault's token symbol, "mJPYC" (1 mJPYC stands for ¥1). */
  readonly symbol: string
}

/** The AP agent's vault balance, live from Sepolia. Null while loading or unreadable: hide it, never guess it. */
export function useVaultBalance(): VaultBalance | null {
  const load = useVault()
  return load.kind === 'ready' ? { amount: load.vault.balance, symbol: load.vault.symbol } : null
}

export interface AgentStatus {
  /** "ap.meigi.eth" */
  readonly name: string
  /** The agent's own `agent-status` ENS text record ("online"), which only its key may set; null if unread. */
  readonly status: string | null
  /** True once ENS confirms the vault's primary name is the agent's name. */
  readonly primaryName: boolean
}

/** The AP agent's identity and status, read through stock ENS on Sepolia. */
export function useAgentStatus(): AgentStatus {
  const { status, primary } = useAgentEns()
  return { name: AGENT_ENS_NAME, status, primaryName: primary === true }
}

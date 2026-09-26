// Live reads of the AgentVault the AP agent spends from: its token balance and one vendor's approval and caps.

import { agentVaultAbi, mockJPYCAbi } from '@meigi/abi'
import { env, type HexAddress } from '../env/env'
import { publicClient } from './client'
import { formatTokenAmount } from './format'

export interface VaultVendorState {
  readonly approved: boolean
  readonly payout: HexAddress | null
  readonly capPerPayment: string
  readonly capPerPeriod: string
  /** What the vendor can still be paid this period, or null if the vault wouldn't say. */
  readonly remainingInPeriod: string | null
  readonly active: boolean
  /** When a newly approved vendor starts receiving payments (the vault's vendor delay). */
  readonly activeAt: Date | null
}

export interface VaultState {
  readonly balance: string
  readonly symbol: string
  readonly paused: boolean
  readonly vendor: VaultVendorState
}

const ZERO = '0x0000000000000000000000000000000000000000'

export async function readVault(vendorTNumber: bigint): Promise<VaultState> {
  const vault = { address: env.vault, abi: agentVaultAbi } as const
  const token = { address: env.token, abi: mockJPYCAbi } as const
  const [balance, decimals, symbol, paused, vendor, remaining, block] = await Promise.all([
    publicClient.readContract({ ...token, functionName: 'balanceOf', args: [env.vault] }),
    publicClient.readContract({ ...token, functionName: 'decimals' }),
    publicClient.readContract({ ...token, functionName: 'symbol' }),
    publicClient.readContract({ ...vault, functionName: 'paused' }),
    publicClient.readContract({ ...vault, functionName: 'vendors', args: [vendorTNumber] }),
    // Optional: an older vault without it still shows everything else.
    publicClient.readContract({ ...vault, functionName: 'remainingInPeriod', args: [vendorTNumber] }).catch(() => null),
    publicClient.getBlock(),
  ])
  const [payout, activeAt, , capPerPayment, capPerPeriod] = vendor
  const approved = payout !== ZERO
  return {
    balance: formatTokenAmount(balance, decimals),
    symbol,
    paused,
    vendor: {
      approved,
      payout: approved ? payout : null,
      capPerPayment: formatTokenAmount(capPerPayment, decimals),
      capPerPeriod: formatTokenAmount(capPerPeriod, decimals),
      remainingInPeriod: approved && remaining !== null ? formatTokenAmount(remaining, decimals) : null,
      active: approved && block.timestamp >= activeAt,
      activeAt: approved ? new Date(Number(activeAt) * 1000) : null,
    },
  }
}

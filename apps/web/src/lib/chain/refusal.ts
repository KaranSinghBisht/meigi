// The vault refusing the bank-change scam, live on Sepolia: AgentVault.payInvoice as an eth_call (viem
// simulateContract) from the vault's own agent, read live, with the address the scam email asked for. Read-only: no
// wallet, no key, nothing is sent. Only the vault's PayeeMismatch for exactly this invoice counts as the refusal;
// anything else (an RPC failure, another revert, or no revert at all) is "not live", and the page shows the recorded
// run instead.

import { agentVaultAbi, payeeRegistryAbi } from '@meigi/abi'
import { isAddress, isAddressEqual, toHex, type Hex } from 'viem'
import { env, type HexAddress } from '../env/env'
import { publicClient } from './client'
import { describeChainError } from './errors'

/** The bank-change invoice from the recorded run (features/agent/recorded): MS-2026-1003 to 株式会社メイギ商事. */
export const SWAPPED_INVOICE = {
  tNumber: 2011001234567n, // T2011001234567
  payTo: '0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b', // the new address in the scam email
  units: 132_000n * 10n ** 18n, // ¥132,000 in mJPYC, which has 18 decimals
} as const

export type LiveRefusal =
  | {
      readonly live: true
      /** The block the call ran against. */
      readonly block: bigint
      /** The registered name, empty if the registry shows none. */
      readonly legalName: string
      /** The one address the vault pays for this T-number. */
      readonly registered: HexAddress
    }
  | { readonly live: false }

/** A fresh invoice reference for every call, so the vault's duplicate check can never answer first. */
const freshRef = (): Hex => toHex(crypto.getRandomValues(new Uint8Array(32)))

/** The vault's PayeeMismatch for exactly this invoice: its T-number and the swapped address, and a real address. */
function refusedWith(error: unknown): HexAddress | null {
  const failure = describeChainError(error)
  const [tNumber, expected, registered] = failure.args ?? []
  if (failure.errorName !== 'PayeeMismatch' || tNumber !== SWAPPED_INVOICE.tNumber) return null
  if (typeof expected !== 'string' || !isAddress(expected) || !isAddressEqual(expected, SWAPPED_INVOICE.payTo)) {
    return null
  }
  return typeof registered === 'string' && isAddress(registered) ? registered : null
}

/**
 * Asks the vault to pay the swapped address, as its agent, one block behind the head (every node behind a
 * load-balanced RPC has it). Throws only if the chain can't be read at all; the caller treats that as not live.
 */
export async function refuseLive(): Promise<LiveRefusal> {
  const block = (await publicClient.getBlockNumber({ cacheTime: 0 })) - 1n
  const [agent, payee] = await Promise.all([
    publicClient.readContract({ address: env.vault, abi: agentVaultAbi, functionName: 'agent', blockNumber: block }),
    publicClient.readContract({
      address: env.registry,
      abi: payeeRegistryAbi,
      functionName: 'payeeOf',
      args: [SWAPPED_INVOICE.tNumber],
      blockNumber: block,
    }),
  ])
  try {
    await publicClient.simulateContract({
      address: env.vault,
      abi: agentVaultAbi,
      functionName: 'payInvoice',
      args: [SWAPPED_INVOICE.tNumber, SWAPPED_INVOICE.payTo, SWAPPED_INVOICE.units, freshRef()],
      account: agent,
      blockNumber: block,
    })
  } catch (error) {
    const registered = refusedWith(error)
    return registered ? { live: true, block, legalName: payee.legalName, registered } : { live: false }
  }
  return { live: false } // the vault would have paid: never shown as a refusal
}

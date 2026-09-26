// The injected EIP-1193 wallet (Brave Wallet, MetaMask, …) on Sepolia. Writes are simulated first against
// the public RPC, so a revert surfaces as a decoded contract error before the wallet ever prompts.

import { payeeRegistryAbi } from '@meigi/abi'
import {
  createWalletClient,
  custom,
  SwitchChainError,
  type EIP1193Provider,
  type Hex,
  type TransactionReceipt,
} from 'viem'
import { sepolia } from 'viem/chains'
import { env, type HexAddress } from '../env/env'
import { publicClient } from './client'

declare global {
  interface Window {
    ethereum?: EIP1193Provider
  }
}

export function injectedProvider(): EIP1193Provider | null {
  return typeof window !== 'undefined' && window.ethereum ? window.ethereum : null
}

function walletClient(provider: EIP1193Provider) {
  return createWalletClient({ chain: sepolia, transport: custom(provider) })
}

/** Accounts the site is already allowed to see (no prompt). */
export async function authorisedAccounts(provider: EIP1193Provider): Promise<HexAddress[]> {
  return walletClient(provider).getAddresses()
}

/** Prompts the wallet to connect. */
export async function requestAccounts(provider: EIP1193Provider): Promise<HexAddress[]> {
  return walletClient(provider).requestAddresses()
}

export async function walletChainId(provider: EIP1193Provider): Promise<number> {
  return walletClient(provider).getChainId()
}

/** Switches to Sepolia, adding it first if the wallet doesn't know it (EIP-3085 error 4902). */
export async function switchToSepolia(provider: EIP1193Provider): Promise<void> {
  const client = walletClient(provider)
  try {
    await client.switchChain({ id: sepolia.id })
  } catch (error) {
    const unknownChain = error instanceof SwitchChainError || (error as { code?: number }).code === 4902
    if (!unknownChain) throw error
    await client.addChain({ chain: sepolia })
    await client.switchChain({ id: sepolia.id })
  }
}

/** EIP-191 personal_sign of a UTF-8 message. */
export async function personalSign(provider: EIP1193Provider, account: HexAddress, message: string): Promise<Hex> {
  return walletClient(provider).signMessage({ account, message })
}

export interface WireApproval {
  readonly officerIds: readonly Hex[]
  readonly deadline: bigint
  readonly signature: Hex
}

/** The controller queues a payout change: `requestPayoutChange(tNumber, newPayout, approval)`. */
export async function sendPayoutChange(
  provider: EIP1193Provider,
  account: HexAddress,
  tNumber: bigint,
  newPayout: HexAddress,
  approval: WireApproval,
): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    account,
    address: env.registry,
    abi: payeeRegistryAbi,
    functionName: 'requestPayoutChange',
    args: [tNumber, newPayout, { ...approval, officerIds: [...approval.officerIds] }],
  })
  return walletClient(provider).writeContract({ ...request, account, chain: sepolia })
}

/**
 * The controller cancels a queued payout change directly: `cancelPayoutChange(tNumber)`. No officer approval
 * needed - `PayeeRegistry._requireCanceller` allows the controller, an attester or governance, and this is the
 * controller exercising that on their own, without going through the verifier's officer-quorum intent at all.
 */
export async function sendCancelPayoutChange(
  provider: EIP1193Provider,
  account: HexAddress,
  tNumber: bigint,
): Promise<Hex> {
  const { request } = await publicClient.simulateContract({
    account,
    address: env.registry,
    abi: payeeRegistryAbi,
    functionName: 'cancelPayoutChange',
    args: [tNumber],
  })
  return walletClient(provider).writeContract({ ...request, account, chain: sepolia })
}

export async function waitForReceipt(hash: Hex): Promise<TransactionReceipt> {
  return publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
}

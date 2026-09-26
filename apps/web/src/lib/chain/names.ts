// Names a company issued under its payee name, through CompanyNamespace on the Sepolia ENSv2 Beta: each label's
// holder and expiry, whether it answers right now, and what it publishes (its ENSIP-27 class, description and
// agent-status), read with stock viem, as a standard ENS client does. An issued name is text-only: it has no address,
// so it can never be paid. Also whether the AgentVault obeys one of them: its agent is a MandateGate for that name.

import { agentVaultAbi, mandateGateAbi } from '@meigi/abi'
import { isAddressEqual, parseAbi, zeroAddress } from 'viem'
import { env, type HexAddress } from '../env/env'
import { publicClient } from './client'
import type { ParsedTNumber } from './tNumber'

// The three views the page reads (contracts/src/ens/CompanyNamespace.sol).
const companyNamespaceAbi = parseAbi([
  'function labelsOf(uint64 tNumber) view returns (string[])',
  'function nameOf(uint64 tNumber, string label) view returns (address holder, address records, address issuer, uint64 expiry)',
  'function answers(uint64 tNumber, string label) view returns (bool)',
])
const gate = { address: env.companyNamespace, abi: companyNamespaceAbi } as const

export interface IssuedName {
  readonly label: string
  /** e.g. ap.t2011001234567.payee.eth */
  readonly name: string
  /** Null once the name expired or was revoked. */
  readonly holder: HexAddress | null
  readonly expiry: Date | null
  /** Whether it answers right now: not while the payee is disputed, after a key rotation, or if Meigi blocked it. */
  readonly answers: boolean
  /** ENSIP-27 ("Agent", "Workgroup", "Person"), as the name publishes it; null while it doesn't answer. */
  readonly nameClass: string | null
  readonly description: string | null
  readonly agentStatus: string | null
}

async function published(name: string) {
  const [nameClass, description, agentStatus] = await Promise.all(
    ['class', 'description', 'agent-status'].map((key) => publicClient.getEnsText({ name, key })),
  )
  return { nameClass: nameClass ?? null, description: description ?? null, agentStatus: agentStatus ?? null }
}

async function readName(tNumber: ParsedTNumber, label: string): Promise<IssuedName> {
  const name = `${label}.${tNumber.ens}`
  const [[holder, , , expiry], answers] = await Promise.all([
    publicClient.readContract({ ...gate, functionName: 'nameOf', args: [tNumber.value, label] }),
    publicClient.readContract({ ...gate, functionName: 'answers', args: [tNumber.value, label] }),
  ])
  const texts = answers ? await published(name) : { nameClass: null, description: null, agentStatus: null }
  return {
    label,
    name,
    holder: holder === zeroAddress ? null : holder,
    expiry: expiry > 0n ? new Date(Number(expiry) * 1000) : null,
    answers,
    ...texts,
  }
}

/** Every name the company issued in its current namespace, in issue order, revoked and expired ones included. */
export async function readIssuedNames(tNumber: ParsedTNumber): Promise<IssuedName[]> {
  const labels = await publicClient.readContract({ ...gate, functionName: 'labelsOf', args: [tNumber.value] })
  return Promise.all(labels.map((label) => readName(tNumber, label)))
}

/** Who may ask the vault to pay: its agent key, or a MandateGate that obeys one company's issued name. */
export type VaultAgent =
  | { readonly kind: 'key'; readonly address: HexAddress }
  | { readonly kind: 'mandate'; readonly principal: bigint; readonly label: string }

/** The vault's agent right now. A contract that isn't a MandateGate for this vault reads as neither. */
export async function readVaultAgent(): Promise<VaultAgent | null> {
  const agent = await publicClient.readContract({ address: env.vault, abi: agentVaultAbi, functionName: 'agent' })
  const code = await publicClient.getCode({ address: agent })
  if (!code || code === '0x') return { kind: 'key', address: agent }
  const mandate = { address: agent, abi: mandateGateAbi } as const
  const [principal, label, vault] = await Promise.all([
    publicClient.readContract({ ...mandate, functionName: 'principal' }),
    publicClient.readContract({ ...mandate, functionName: 'label' }),
    publicClient.readContract({ ...mandate, functionName: 'vault' }),
  ])
  return isAddressEqual(vault, env.vault) ? { kind: 'mandate', principal, label } : null
}

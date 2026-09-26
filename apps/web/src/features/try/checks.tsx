import type { ReactNode } from 'react'
import type { CheckLink } from './TryCheck'
import { BOOTH, BoothStatus, EnsStatus, FIXTURE, RefusalStatus, RegistryStatus, SettlementsStatus } from './statuses'

const ENS_APP = 'https://app.ens.dev'
const AWAJI = 'https://awaji.blockscout.com/address'
/** Meigi's registry and PayRouter on Mizuhiki (Awaji), contracts/deployments/6497.json. */
const AWAJI_REGISTRY = '0x4dbF8b5C3da46996C156AC3d17B16a230387b7C4'
const AWAJI_ROUTER = '0x589E7f274Cd5E87d71443993AC30b39E2E70659e'

export interface Check {
  readonly title: string
  /** One line: what this check proves. */
  readonly proves: string
  readonly status?: ReactNode
  readonly links: readonly CheckLink[]
}

/** Seven live proofs, each with its own link, in the order a first visit makes sense of them. */
export const CHECKS: readonly Check[] = [
  {
    title: 'Look up a payee',
    proves:
      'A T-number answers with its registered name and the one address it can be paid at, straight from the chain.',
    status: <RegistryStatus />,
    links: [{ label: 'Open 株式会社メイギ商事', href: `/registry/${FIXTURE}` }],
  },
  {
    title: 'Resolve it in any ENS client',
    proves:
      't2011001234567.payee.eth resolves to that payout in stock viem or any ENS app, with no Meigi code, and the agent has its own name.',
    status: <EnsStatus />,
    links: [
      { label: 't2011001234567.payee.eth on app.ens.dev', href: `${ENS_APP}/t2011001234567.payee.eth` },
      { label: 'ap.meigi.eth on app.ens.dev', href: `${ENS_APP}/ap.meigi.eth` },
    ],
  },
  {
    title: 'Watch the vault refuse a swapped address',
    proves:
      'An AI agent believed a bank-change email and tried to pay a new wallet. The AgentVault refused: it only pays the registered payout.',
    status: <RefusalStatus />,
    links: [{ label: 'See the run in the AP agent', href: '/agent' }],
  },
  {
    title: 'A company registered by World ID officers',
    proves: 'Verified humans enrolled as its officers, and any payout change waits 72 hours in public before it lands.',
    status: <BoothStatus />,
    links: [{ label: `Open ${BOOTH}`, href: `/registry/${BOOTH}` }],
  },
  {
    title: 'Check a withdrawal',
    proves:
      'Give an address or ENS name and a T-number: the check an exchange runs before a withdrawal leaves, live in your browser.',
    links: [{ label: 'Check a withdrawal', href: '/business#withdrawal-check' }],
  },
  {
    title: 'Agents paying agents',
    proves:
      'A research agent buys GPU time and data over x402, and checks every payTo against the registry and ENS before it signs.',
    status: <SettlementsStatus only="x402" />,
    links: [{ label: 'See the agent shop', href: '/x402' }],
  },
  {
    title: 'Settlements, indexed by Curvegrid MultiBaas',
    proves:
      "Every payment Meigi's contracts settle, read from MultiBaas's event index. The same contracts run on Mizuhiki (Awaji) too.",
    status: <SettlementsStatus />,
    links: [
      { label: 'Payments received by 株式会社メイギ商事', href: `/registry/${FIXTURE}` },
      { label: 'Awaji registry on Blockscout', href: `${AWAJI}/${AWAJI_REGISTRY}` },
      { label: 'Awaji PayRouter on Blockscout', href: `${AWAJI}/${AWAJI_ROUTER}` },
    ],
  },
]

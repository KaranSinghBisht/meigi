// Chapter 0: 株式会社メイギ商事 joins Meigi. The wizard is a replica of /register; every value it lands on is the
// company's real registration on Sepolia, read from the registry's PayeeRegistered event (registry
// 0x205c977cF1f4Ed42e51a48759550eF40160A6396, from block 11781105) and officersOf(2011001234567).
//
// The company is a fictional fixture (not in the NTA index), registered by contracts/script/seed-demo.sh: no
// domain proof, a placeholder officer keccak("meigi-demo-fixture-officer") that no one can prove, and fixture
// evidence keccak("demo-fixture:fictional-vendor:not-an-NTA-company"). The chapter says so wherever it matters.

import { shortAddress, shortHash } from '../../../lib/chain/format'

const TX = '0x277c211583a26ed34ca3b40fdb695dfef0b6b19df8a700e44857a1e4a78dd2dc'
const REGISTRY = '0x205c977cF1f4Ed42e51a48759550eF40160A6396'
const CONTROLLER = '0xc33a9cD6662D39E190855c43a459CBcB938e4638'
const PAYOUT = '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4'
const EVIDENCE = '0xf8b96e6b0387f0ec42ba9d83575afbfe17774918210bba7a834f3b562e3248ae'
const OFFICER = '0xe2218d9c34f8b3b3f15371bc96c1aa16f2f491f96ab37edad6030481b829a3ad'
const T_NUMBER = 'T2011001234567'

export const ONBOARD = {
  tNumber: T_NUMBER,
  legalName: '株式会社メイギ商事',
  ens: `${T_NUMBER.toLowerCase()}.payee.eth`,
  registry: REGISTRY,
  registryShort: shortAddress(REGISTRY),
  controller: CONTROLLER,
  controllerShort: shortAddress(CONTROLLER),
  payout: PAYOUT,
  payoutShort: shortAddress(PAYOUT),
  evidenceShort: shortHash(EVIDENCE),
  officerShort: shortHash(OFFICER),
  officers: 1,
  txHash: TX,
  txShort: shortHash(TX),
  block: 11_781_118,
  /** The block's time: 2026-09-26 03:49:12 JST. */
  at: new Date('2026-09-25T18:49:12Z'),
  /** The public payee page the registered payee card's QR code opens. */
  payeeUrl: `https://meigi.karanbishttt.workers.dev/registry/${T_NUMBER}`,
  appHost: 'meigi.karanbishttt.workers.dev',
} as const

/**
 * Steps passed but not done, which the rail marks "–" as /register does: representation (not built for anyone
 * yet), and for this fictional fixture its domain and its placeholder officer. 1-based.
 */
export const ONBOARD_SKIPPED: readonly number[] = [3, 4, 5]

/** The wizard's seven screens, as the real progress rail names them (register/flow/steps.ts). */
export const ONBOARD_STEPS = [
  'Your company',
  'Your wallets',
  'Prove your domain',
  'Prove representation',
  'Your officers',
  'Review and register',
  'Registered',
] as const

/** Each screen's question and lede, verbatim from /register (register/flow/copy.ts), so the replica never drifts. */
export const ONBOARD_COPY = {
  company: {
    title: 'Which company is joining?',
    lede: 'Enter its T-number, the qualified invoice number, or paste its LEI. Meigi fills in the rest from the National Tax Agency registry.',
  },
  wallets: {
    title: 'Which wallets will it use?',
    lede: 'A business key that approves changes, and the one address every payment goes to.',
  },
  domain: {
    title: 'No domain to prove',
    lede: 'A fictional company has no real domain, so Meigi skips this step and records it as fictional.',
  },
  representative: {
    title: 'Prove you represent the company',
    lede: 'Controlling a domain doesn’t make someone the company. Its registered representative will sign for it.',
  },
  officers: {
    title: 'Who approves changes?',
    lede: 'Real companies enroll officers with World ID. This demo company has a placeholder officer no one can prove, so no one can change its payout.',
  },
  review: {
    title: 'Check everything, then register',
    lede: 'Meigi’s attester writes this registration to the public registry on Sepolia. A number that’s already claimed is frozen as disputed, never overwritten.',
  },
  registered: {
    title: 'You’re registered.',
    lede: `Payers who check ${ONBOARD.ens} will only ever pay the address below. Changing it takes your business key, your officers and 72 hours in public.`,
  },
} as const

/** How a registrant will prove they act for the company: not built for anyone yet, so both are shown disabled. */
export const REPRESENTATION_METHODS = [
  {
    id: 'certificate',
    title: 'Sign with 商業登記電子証明書',
    body: 'The Legal Affairs Bureau’s corporate e-certificate for the registered representative, signed remotely through gBizID.',
  },
  {
    id: 'mail',
    title: 'Mail a code to the registered head office',
    body: 'A one-time code by registered mail to the head office the NTA lists, entered here on arrival.',
  },
] as const

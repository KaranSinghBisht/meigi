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

/** Steps this fictional fixture couldn't really do (no domain, a placeholder officer): the rail marks them "–". */
export const ONBOARD_SKIPPED: readonly number[] = [3, 4]

/** The wizard's six screens, as the real progress rail names them. */
export const ONBOARD_STEPS = [
  'Your company',
  'Your wallets',
  'Prove your domain',
  'Your officers',
  'Review and register',
  'Registered',
] as const

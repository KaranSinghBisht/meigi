// A registration as it happened on Sepolia, which the hosted /register replays screen by screen. The replay reads
// nothing but this, so swapping RECORDING for another registration changes no UI. Every value is the
// registration's own: check it against the transaction and the registry (payeeOf, officersOf).

import type { HexAddress } from '../../../lib/env/env'
import type { PayoutMode } from '../flow/useOnboarding'

export interface RecordedOfficer {
  /** The officer id the registry holds (officersOf). */
  readonly id: `0x${string}`
  /** `world-id`: a real World ID session. `placeholder`: a seeded demo company's officer that no one can prove. */
  readonly proof: 'world-id' | 'placeholder'
  /** Selfie Check's sybil score as the verifier returned it at enrollment; leave it out for any other credential. */
  readonly sybilScore?: number | null
}

export interface Recording {
  /**
   * `wizard`: recorded from a real run through the live wizard, so every screen shows what was done. `seed`:
   * registered on-chain directly (by Meigi's seed script), so the screens only show how the wizard presents it.
   */
  readonly source: 'wizard' | 'seed'
  /** The registration's transaction, its block and the block's time (ISO 8601). */
  readonly txHash: `0x${string}`
  readonly block: number
  readonly at: string
  readonly company: {
    readonly tNumber: string
    /** What was typed into the "T-number or LEI" field. */
    readonly query: string
    readonly legalName: string
    /** The NTA head office; empty for a fictional company. */
    readonly address: string
    /** A demo company: not in the NTA registry. */
    readonly fixture: boolean
    /** Why it is fictional, in the words its company card shows; null for a real company. */
    readonly note: string | null
    readonly lei: string | null
  }
  /** The business key (the registry's controller). */
  readonly controller: HexAddress
  /** The address the registry pays, and how the wallets screen named it (absent for a seeded registration). */
  readonly payout: { readonly address: HexAddress; readonly mode?: PayoutMode }
  /** `fixture`: skipped as a demo company. A null name: none was recorded (a seeded demo company). */
  readonly domain: { readonly name: string | null; readonly method: 'dns' | 'well-known' | 'fixture' }
  readonly officers: readonly RecordedOfficer[]
  readonly threshold: number
}

/**
 * 株式会社メイギ商事, T2011001234567: a demo company, not in the NTA registry, that contracts/script/seed-demo.sh
 * registered on Sepolia through the attester directly (no wizard, no wallet), with no domain and a placeholder officer
 * keccak256("meigi-demo-fixture-officer"). The same registration demo chapter 0 shows. Read back from registry
 * 0x205c977cF1f4Ed42e51a48759550eF40160A6396. Until a real wizard run is recorded, the replay presents this one.
 */
const MEIGI_SHOJI: Recording = {
  source: 'seed',
  txHash: '0x277c211583a26ed34ca3b40fdb695dfef0b6b19df8a700e44857a1e4a78dd2dc',
  block: 11_781_118,
  at: '2026-09-25T18:49:12Z',
  company: {
    tNumber: 'T2011001234567',
    query: 'T2011001234567',
    legalName: '株式会社メイギ商事',
    address: '',
    fixture: true,
    note: 'Not in the NTA registry. Our seed script registered it on Sepolia directly, not through this wizard.',
    lei: null,
  },
  controller: '0xc33a9cD6662D39E190855c43a459CBcB938e4638',
  payout: { address: '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4' },
  domain: { name: null, method: 'fixture' },
  officers: [{ id: '0xe2218d9c34f8b3b3f15371bc96c1aa16f2f491f96ab37edad6030481b829a3ad', proof: 'placeholder' }],
  threshold: 1,
}

export const RECORDING: Recording = MEIGI_SHOJI

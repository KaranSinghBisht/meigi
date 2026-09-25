// Two real purchases by the guarded buyer agent on Sepolia, replayed on the hosted site. The honest one
// settled on-chain (10 mJPYC to 株式会社フジデータ's registered payout, block 11781441); the compromised one was
// refused by the guard before anything was signed, so it has no transaction.

import type { DeclaredKind, Purchase } from '../../lib/api/merchant'

export const RECORDED_AT = new Date('2026-09-25T19:57:00Z')

const MERCHANT = { tNumber: 'T8999900000001', legalName: '株式会社フジデータ' } as const

export const RECORDED_PURCHASES: Record<DeclaredKind, Purchase> = {
  honest: {
    verdict: {
      ok: true,
      unverified: false,
      code: null,
      reason: null,
      ...MERCHANT,
      payTo: '0x0C1d13e3CC82f3a6e0694D3EDe031595Ce32578D',
      screening: null,
    },
    paid: true,
    txHash: '0xf3c298960b9abac5466f4aa6e59f9a9ba4b73de703df3468d72f18049077b0df',
    data: null,
  },
  compromised: {
    verdict: {
      ok: false,
      unverified: false,
      code: 'payto_mismatch',
      reason: "payTo 0xdCa5…6d5b is not 株式会社フジデータ (T8999900000001)'s registered payout 0x0C1d…578D",
      tNumber: null,
      legalName: null,
      payTo: null,
      screening: null,
    },
    paid: false,
    txHash: null,
    data: null,
  },
}

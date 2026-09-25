import type { MerchantKind } from '../../lib/api/merchant'

export interface MerchantCopy {
  readonly title: string
  readonly eyebrow: string
  readonly body: string
  readonly button: string
  readonly progress: string
}

export const MERCHANTS: Record<MerchantKind, MerchantCopy> = {
  honest: {
    title: 'Honest merchant',
    eyebrow: 'payTo = registered payout',
    body: "The 402 response asks the agent to pay the merchant's registered payout, and declares its T-number.",
    button: 'Buy from honest merchant',
    progress:
      'The guard checks payTo against the registry, then the buyer signs and the facilitator settles on Sepolia. This takes 10–20 seconds.',
  },
  compromised: {
    title: 'Compromised merchant',
    eyebrow: 'payTo swapped',
    body: "Same merchant, same T-number, but its server was hacked and the 402's payTo now points at the attacker.",
    button: 'Buy from compromised merchant',
    progress: 'The guard checks payTo against the registry before anything is signed…',
  },
  unverified: {
    title: 'Unverified merchant',
    eyebrow: 'no Meigi record · clean payTo',
    body: 'A merchant with no T-number to check. The agent pays it only small amounts, and only after Intercepta screens payTo and finds it clean.',
    button: 'Buy from unverified merchant',
    progress: 'Intercepta screens payTo; only a clean result lets the agent sign a small payment…',
  },
  'unverified-flagged': {
    title: 'Unverified merchant, flagged address',
    eyebrow: 'no Meigi record · sanctioned payTo',
    body: "Also no Meigi record, but its payTo is the OFAC-listed Ronin bridge exploiter's address.",
    button: 'Buy from flagged merchant',
    progress: 'Intercepta screens payTo before anything is signed…',
  },
}

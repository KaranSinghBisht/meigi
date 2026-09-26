// Chapter 5: agents buying compute and data over x402, each payment checked by the Meigi guard before signing.
// The player reads an X402Run. A recorded research-agent run (services/x402-demo, `research-agent.ts --json`)
// becomes one through fromScenario (x402Scenario.ts). Until that recording is in, the player plays the
// PLACEHOLDER below and says so on screen: only its transaction hash and refusal sentence are real.

export type GuardCheckState = 'pass' | 'fail' | 'skip'

export interface GuardCheck {
  readonly label: string
  readonly state: GuardCheckState
  readonly detail: string
}

export type X402Outcome =
  | { readonly status: 'settled'; readonly txHash: string | null }
  | { readonly status: 'refused'; readonly reason: string }

export interface X402Purchase {
  readonly id: string
  /** What the agent is buying, and from whom, e.g. "GPU-minute 1 of 2, from Minato GPU Cloud". */
  readonly title: string
  /** The request line the terminal prints, e.g. "POST /compute/minato/gpu-minute". */
  readonly request: string
  /** The 402's price, e.g. "15 mJPYC"; null when the merchant didn't quote one. */
  readonly price: string | null
  /** The merchant's declared identity in its 402 answer; null for an API that declares none. */
  readonly declared: { readonly tNumber: string; readonly ens: string | null } | null
  readonly payTo: string
  readonly checks: readonly GuardCheck[]
  readonly outcome: X402Outcome
}

export interface X402Run {
  /** True while the fixture stands in for the recorded run; the player labels the chapter as such. */
  readonly placeholder: boolean
  readonly recordedAt: string | null
  readonly buyer: string
  readonly purchases: readonly X402Purchase[]
}

/** PLACEHOLDER: replaced by the recorded research-agent run from services/x402-demo. */
export const PLACEHOLDER_X402_RUN: X402Run = {
  placeholder: true,
  recordedAt: null,
  buyer: 'research-agent',
  purchases: [
    {
      id: 'gpu',
      title: 'GPU-minutes, from Minato GPU Cloud',
      request: 'POST /compute/minato/gpu-minute',
      price: '15 mJPYC',
      declared: { tNumber: 'T79999…', ens: 't79999….payee.eth' },
      payTo: 'the registered payout',
      checks: [
        { label: 'ENS name resolves', state: 'pass', detail: 't79999….payee.eth → the registered payout' },
        { label: 'Registry', state: 'pass', detail: 'registered and active' },
        { label: 'payTo matches', state: 'pass', detail: 'payTo is the registered payout' },
      ],
      outcome: { status: 'settled', txHash: '0x3146ec4fa1c89a192f8585f315c720724587f404e3d5e7e6cdfd341b825debd6' },
    },
    {
      id: 'swapped',
      title: 'A compromised GPU inference mirror',
      request: 'POST /compute/minato/inference/compromised',
      price: '30 mJPYC',
      declared: { tNumber: 'T8999900000001', ens: 't8999900000001.payee.eth' },
      payTo: '0xdCa5…6d5b',
      checks: [
        { label: 'ENS name resolves', state: 'pass', detail: 't8999900000001.payee.eth → 0x0C1d…578D' },
        { label: 'payTo matches', state: 'fail', detail: 'payTo asks for 0xdCa5…6d5b' },
      ],
      outcome: {
        status: 'refused',
        reason:
          't8999900000001.payee.eth resolves to the registered payout 0x0C1d…578D, but payTo asks for 0xdCa5…6d5b instead',
      },
    },
    {
      id: 'undeclared',
      title: 'A public web-scrape API with no Meigi record',
      request: 'GET /web/scrape/undeclared',
      price: '10 mJPYC',
      declared: null,
      payTo: 'an unregistered address',
      checks: [
        { label: 'Declares a payee', state: 'skip', detail: 'no Meigi record: at most 50 mJPYC' },
        { label: 'Screening', state: 'pass', detail: 'a clean screen is required' },
      ],
      outcome: { status: 'settled', txHash: null },
    },
  ],
}

export const X402_RUN: X402Run = PLACEHOLDER_X402_RUN

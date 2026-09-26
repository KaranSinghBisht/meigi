// Chapter 5: agents buying compute and data over x402, each payment checked by the Meigi guard before signing.
// The player reads an X402Run. Until the research-agent run from services/x402-demo is recorded, it plays the
// PLACEHOLDER below, which says so on screen: only its transaction hash and refusal sentence are real.

export type GuardCheckState = 'pass' | 'fail' | 'skip'

export interface GuardCheck {
  readonly label: string
  readonly state: GuardCheckState
  readonly detail: string
}

export type X402Outcome =
  | { readonly status: 'settled'; readonly txHash: string }
  | { readonly status: 'refused'; readonly reason: string }

export interface X402Purchase {
  readonly id: string
  /** What the buying agent wants, e.g. "2 GPU-minutes". */
  readonly item: string
  readonly merchant: string
  /** The request line the terminal prints, e.g. "POST https://gpu.minato.example/v1/jobs". */
  readonly request: string
  readonly price: string
  /** The merchant's declared identity in its 402 answer; null for an API that declares none. */
  readonly declared: { readonly tNumber: string; readonly ens: string } | null
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

/** PLACEHOLDER: replace with the recorded research-agent run from services/x402-demo. */
export const PLACEHOLDER_X402_RUN: X402Run = {
  placeholder: true,
  recordedAt: null,
  buyer: 'research-agent',
  purchases: [
    {
      id: 'gpu',
      item: '2 GPU-minutes',
      merchant: 'Minato GPU Cloud',
      request: 'POST gpu.minato.example/v1/jobs',
      price: '20 mJPYC',
      declared: { tNumber: 'T7999900000001', ens: 't7999900000001.payee.eth' },
      payTo: '0x0C1d…578D',
      checks: [
        { label: 'ENS name resolves', state: 'pass', detail: 't7999900000001.payee.eth → registered payout' },
        { label: 'Registry: active', state: 'pass', detail: 'T7999900000001 is registered and active' },
        { label: 'payTo matches', state: 'pass', detail: 'payTo is the registered payout' },
        { label: 'Screening', state: 'pass', detail: 'clean' },
      ],
      outcome: { status: 'settled', txHash: '0x3146ec4fa1c89a192f8585f315c720724587f404e3d5e7e6cdfd341b825debd6' },
    },
    {
      id: 'swapped',
      item: 'dataset slice',
      merchant: 'Fuji Data (compromised)',
      request: 'GET data.fuji.example/v1/slices/jp-invoices',
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
      item: 'weather lookup',
      merchant: 'an undeclared API',
      request: 'GET api.undeclared.example/v1/weather',
      price: '5 mJPYC',
      declared: null,
      payTo: '0x7a3E…91c2',
      checks: [
        { label: 'Declares a payee', state: 'skip', detail: 'no T-number: allowance only' },
        { label: 'Within allowance', state: 'pass', detail: '5 ≤ 50 mJPYC' },
        { label: 'Screening', state: 'pass', detail: 'clean screen required' },
      ],
      outcome: { status: 'settled', txHash: '' },
    },
  ],
}

export const X402_RUN: X402Run = PLACEHOLDER_X402_RUN

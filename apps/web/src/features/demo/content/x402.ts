// Chapter 5: agents buying compute and data over x402, each payment checked by the Meigi guard before signing.
// The run is worldui's recorded research-agent run on Sepolia (services/x402-demo, `research-agent.ts --json`,
// exported verbatim to x402-run.json): 3 settled, 2 refused before signing. fromScenario (x402Scenario.ts) turns
// it into the rows the player shows.

import recorded from './x402-run.json'
import { fromScenario } from './x402Scenario'

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
  readonly recordedAt: string | null
  readonly buyer: string
  readonly purchases: readonly X402Purchase[]
}

export const X402_RUN: X402Run = fromScenario(recorded)

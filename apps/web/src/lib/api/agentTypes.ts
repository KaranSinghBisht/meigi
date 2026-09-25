// What the console reads from the AP agent (services/agent). These mirror the service's AnalysisView and
// PayResult, trimmed to the fields the console shows. Amounts are strings: JSON has no bigint.

export type Severity = 'block' | 'warn'

export interface Money {
  readonly value: string
  readonly display: string
}

export interface Flag {
  readonly code: string
  readonly severity: Severity
  readonly message: string
  /** The document (or model) text behind the finding, for the console only. */
  readonly evidence: string | null
}

export interface Extraction {
  readonly kind: string
  readonly tNumber: string | null
  readonly claimedName: string | null
  readonly address: string | null
  readonly addresses: readonly string[]
  readonly amount: Money | null
  readonly invoiceNumber: string | null
  readonly dueDate: string | null
  readonly flags: readonly Flag[]
}

export type Triage =
  | {
      readonly status: 'ok'
      readonly backend: string
      readonly model: string | null
      readonly latencyMs: number
      readonly requestType: { readonly value: string; readonly confidence: number }
      readonly newDestination: number
      readonly pressure: number
      readonly suspicion: { readonly score: number; readonly level: string }
      /** Probability the document is a safe routine invoice, and the bar it must clear to auto-clear. */
      readonly pSafe: number | null
      readonly minPSafe: number | null
      readonly route: 'auto_clear' | 'hold'
      readonly holdReasons: readonly string[]
    }
  | { readonly status: 'unavailable'; readonly attempts: readonly string[] }

export type Proposal =
  | {
      readonly status: 'ok'
      readonly provider: string
      readonly model: string
      readonly tNumber: string | null
      readonly payTo: string | null
      readonly amount: string | null
      readonly wouldPay: boolean
      readonly reasoning: string
    }
  | { readonly status: 'unavailable'; readonly provider: string; readonly message: string }

export interface Reason extends Flag {
  readonly layer: string
  readonly revert: string | null
}

export interface Check extends Flag {
  readonly ok: boolean
  readonly revert: string | null
}

export interface Kernel {
  readonly status: string
  readonly ok: boolean
  readonly intent: {
    readonly source: string
    readonly tNumber: string
    readonly payTo: string | null
    readonly amount: string
    readonly invoiceNumber: string
  } | null
  readonly payee: {
    readonly tNumber: string
    readonly status: string
    readonly legalName: string | null
    readonly registeredPayout: string | null
    /** A payout change is queued; its address is never sent, only when it lands. */
    readonly changePending: boolean
    readonly pendingEffectiveAt: number | null
  } | null
  readonly checks: readonly Check[]
  readonly reasons: readonly Reason[]
}

export interface ScreenedAddress {
  readonly address: string
  readonly flagged: boolean
  readonly toxicScore: number
  readonly traits: readonly string[]
}

export type Screening =
  | { readonly status: 'ok'; readonly results: readonly ScreenedAddress[]; readonly errors: readonly string[] }
  | { readonly status: 'unavailable'; readonly reason: string }

export interface Explanation {
  readonly source: string
  readonly text: string
  readonly model: string | null
}

export interface Analysis {
  readonly id: string
  readonly extracted: Extraction
  readonly triage: Triage
  readonly proposal: Proposal
  readonly kernel: Kernel
  readonly screening: Screening
  readonly verdict: {
    readonly decision: 'pay' | 'hold'
    readonly reasons: readonly Reason[]
    readonly warnings: readonly Reason[]
  }
  readonly explanation: Explanation
  readonly totalMs: number | null
  /** Whether a verified human may approve this hold (World ID for Agents), and whether this agent can ask one. */
  readonly approval: { readonly enabled: boolean; readonly approvable: boolean }
}

export interface DecodedRevert {
  readonly name: string
  readonly args: Readonly<Record<string, string>>
  readonly sentence: string
}

export type PayOutcome =
  | {
      readonly status: 'paid'
      readonly txHash: string
      readonly forced: boolean
      readonly payTo: string
      readonly amount: string
    }
  | {
      /** Sent without a receipt yet; asking to pay again settles it (the agent never resends). */
      readonly status: 'pending'
      readonly txHash: string
      readonly forced: boolean
      readonly message: string
    }
  | {
      readonly status: 'reverted'
      /** False for a simulated revert (nothing sent); true with a hash when a sent transaction reverted. */
      readonly broadcast: boolean
      readonly txHash: string | null
      readonly forced: boolean
      readonly error: DecodedRevert
      readonly explanation: Explanation
    }
  | { readonly status: 'held'; readonly reasons: readonly Reason[]; readonly explanation: Explanation }

/** How the console asks to pay: normally, forced (the attack demo), or with a verified human's approval. */
export type PayMode =
  | { readonly kind: 'pay' }
  | { readonly kind: 'force' }
  | { readonly kind: 'approved'; readonly approvalId: string }

export interface DemoInvoice {
  readonly id: string
  readonly title: string
  readonly text: string
  readonly note: string | null
}

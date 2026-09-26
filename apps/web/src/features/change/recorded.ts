/**
 * The shape of one real `/change` approval run, captured from `docs/world-live-run.md`, for the hosted page to
 * replay. No `RECORDED_RUN` constant here yet: this stays type-only until the real production phone run with
 * Karan happens (World ID, Selfie Check, T7999900000002). See `ChangeRecordedRun.tsx` for the replay itself.
 *
 * Every field here is public: officer ids are `keccak256(session_id)`, not a session token or anything personal.
 */

export interface RecordedOfficer {
  readonly officerId: string
  /** The World ID session id that proved this officer, shown short (public, not a secret). */
  readonly sessionId: string
  /** Self Check's z-score, if that's the credential this officer approved with; null for any other credential.
   * A risk signal from World, not a uniqueness verdict — shown as a quiet fact. */
  readonly sybilScore: number | null
}

export interface RecordedChangeRun {
  readonly recordedAt: string // ISO
  readonly tNumber: string
  readonly legalName: string
  readonly action: 'PayoutChange'
  readonly requestedPayout: string
  readonly threshold: number
  readonly officers: readonly RecordedOfficer[]
  /** Which officer's proof actually completed the quorum, in order proved. */
  readonly provedOfficerIds: readonly string[]
  readonly registrationTxHash: `0x${string}`
  readonly queueTxHash: `0x${string}`
  readonly changeDelayHours: number
  /** The verifier's exact refusal message for a second, non-enrolled human trying to approve the same request. */
  readonly impostorRefusal: string
}

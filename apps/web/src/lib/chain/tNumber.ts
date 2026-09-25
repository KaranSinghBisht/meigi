// Japanese qualified-invoice registration numbers: "T" + 13 digits. The registry stores the 13 digits as a
// uint64, and the ENS resolver answers `t<13 digits>.payee.eth`.

export const T_NUMBER_RE = /^T?\d{13}$/

export interface ParsedTNumber {
  /** Canonical display form, e.g. T2011001234567 */
  readonly display: string
  readonly digits: string
  /** Value passed to the registry as uint64 */
  readonly value: bigint
  /** ENS name the resolver answers, e.g. t2011001234567.payee.eth */
  readonly ens: string
}

/** Drops spaces and hyphens and upper-cases a leading "t" before validating. */
export function normaliseTNumber(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function parseTNumber(input: string): ParsedTNumber | null {
  const compact = normaliseTNumber(input)
  if (!T_NUMBER_RE.test(compact)) return null
  const digits = compact.startsWith('T') ? compact.slice(1) : compact
  return { display: `T${digits}`, digits, value: BigInt(digits), ens: `t${digits}.payee.eth` }
}

export function tNumberFromValue(value: bigint): ParsedTNumber {
  const digits = value.toString().padStart(13, '0')
  return { display: `T${digits}`, digits, value, ens: `t${digits}.payee.eth` }
}

/** The fictional fixture payee registered on Sepolia, used for examples and empty states. */
export const FIXTURE_T_NUMBER = 'T2011001234567'

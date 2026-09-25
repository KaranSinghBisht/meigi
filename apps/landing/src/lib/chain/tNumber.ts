// Japanese qualified-invoice registration numbers: "T" + 13 digits.
// On chain the digits are stored as a uint64 without the "T".

export const T_NUMBER_RE = /^T?\d{13}$/

export interface ParsedTNumber {
  /** Canonical display form, e.g. T2011001234567 */
  readonly display: string
  /** Value passed to the registry as uint64 */
  readonly value: bigint
  /** ENS name the registry exposes, e.g. t2011001234567.payee.eth */
  readonly ens: string
}

/**
 * Normalises user input before validating: NFKC folds full-width IME input
 * (Ｔ２０１１…, －) to ASCII, then spaces and hyphens go and t becomes T.
 */
export function normaliseTNumber(input: string): string {
  return input.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase()
}

export function parseTNumber(input: string): ParsedTNumber | null {
  const compact = normaliseTNumber(input)
  if (!T_NUMBER_RE.test(compact)) return null
  const digits = compact.startsWith('T') ? compact.slice(1) : compact
  return {
    display: `T${digits}`,
    value: BigInt(digits),
    ens: `t${digits}.payee.eth`,
  }
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

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

/**
 * Normalises input before validating: NFKC folds full-width IME input (Ｔ２０１１…, －) to ASCII, then spaces and
 * hyphens go and t becomes T.
 */
export function normaliseTNumber(input: string): string {
  return input.normalize('NFKC').replace(/[\s-]/g, '').toUpperCase()
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

/**
 * Registry-office code 9999 (digits 2 to 5) is never issued, so no real company can hold such a number. Meigi's
 * fictional demo companies use it; the verifier registers them only with its fixtures switched on.
 */
export function isUnassignableOffice(tNumber: ParsedTNumber): boolean {
  return tNumber.digits.slice(1, 5) === '9999'
}

/** The fictional fixture payee registered on Sepolia, used for examples and empty states. */
export const FIXTURE_T_NUMBER = 'T2011001234567'

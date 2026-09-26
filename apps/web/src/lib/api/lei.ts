// Global companies by LEI (ISO 17442). The Meigi verifier looks the code up in GLEIF and links Japanese entities
// to their T-number by exact legal name; where the verifier isn't reachable (the public site), the page asks
// GLEIF's public API directly, which can't make that T-number link.

import { env } from '../env/env'
import { ApiError, joinUrl, requestJson } from './http'
import { isRecord, optStr, record, str, type Json } from './parse'

export interface NtaMatch {
  readonly tNumber: string
  readonly name: string
}

export interface LeiRecord {
  readonly lei: string
  readonly legalName: string
  readonly language: string | null
  readonly otherNames: readonly string[]
  readonly jurisdiction: string | null
  readonly country: string | null
  readonly city: string | null
  readonly entityStatus: string
  readonly registrationStatus: string
  readonly nextRenewalDate: string | null
  readonly active: boolean
  /** Null when nobody checked (GLEIF asked directly): only the verifier holds the NTA data. */
  readonly ntaMatches: readonly NtaMatch[] | null
}

const LEI_FORMAT = /^[A-Z0-9]{18}[0-9]{2}$/
const GLEIF_API = 'https://api.gleif.org/api/v1'

/** ISO 7064 MOD 97-10, as for IBANs: letters count as two digits (A = 10 … Z = 35); valid codes are 1 mod 97. */
function mod97(code: string): number {
  let remainder = 0
  for (const char of code) {
    const digits = char >= 'A' ? String(char.charCodeAt(0) - 55) : char
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder
}

/** The normalised LEI (upper case, no spaces) when its format and check digits are valid; otherwise null. */
export function parseLei(input: string): string | null {
  const lei = input.replace(/\s+/g, '').toUpperCase()
  return LEI_FORMAT.test(lei) && mod97(lei) === 1 ? lei : null
}

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [])

function fromVerifier(body: Json): LeiRecord {
  const matches = Array.isArray(body.ntaMatches) ? body.ntaMatches.filter(isRecord) : []
  return {
    lei: str(body, 'lei', 'LEI record'),
    legalName: str(body, 'legalName', 'LEI record'),
    language: optStr(body, 'language'),
    otherNames: strings(body.otherNames),
    jurisdiction: optStr(body, 'jurisdiction'),
    country: optStr(body, 'country'),
    city: optStr(body, 'city'),
    entityStatus: optStr(body, 'entityStatus') ?? 'UNKNOWN',
    registrationStatus: optStr(body, 'registrationStatus') ?? 'UNKNOWN',
    nextRenewalDate: optStr(body, 'nextRenewalDate'),
    active: body.active === true,
    ntaMatches: matches.map((m) => ({ tNumber: str(m, 'tNumber', 'NTA match'), name: str(m, 'name', 'NTA match') })),
  }
}

/** GLEIF's JSON:API record, mapped the way the verifier maps it (active = entity ACTIVE and registration ISSUED). */
function fromGleif(body: Json): LeiRecord {
  const data = record(body.data, 'GLEIF record')
  const attributes = record(data.attributes, 'GLEIF record')
  const entity = record(attributes.entity, 'GLEIF record')
  const registration = record(attributes.registration, 'GLEIF record')
  const legalName = record(entity.legalName, 'GLEIF record')
  const address = isRecord(entity.legalAddress) ? entity.legalAddress : {}
  const others = [entity.otherNames, entity.transliteratedOtherNames].flatMap((list) =>
    Array.isArray(list) ? list.filter(isRecord).flatMap((n) => (typeof n.name === 'string' ? [n.name] : [])) : [],
  )
  const entityStatus = optStr(entity, 'status') ?? 'UNKNOWN'
  const registrationStatus = optStr(registration, 'status') ?? 'UNKNOWN'
  return {
    lei: str(data, 'id', 'GLEIF record'),
    legalName: str(legalName, 'name', 'GLEIF record'),
    language: optStr(legalName, 'language'),
    otherNames: others,
    jurisdiction: optStr(entity, 'jurisdiction'),
    country: optStr(address, 'country'),
    city: optStr(address, 'city'),
    entityStatus,
    registrationStatus,
    nextRenewalDate: optStr(registration, 'nextRenewalDate'),
    active: entityStatus === 'ACTIVE' && registrationStatus === 'ISSUED',
    ntaMatches: null,
  }
}

export async function lookupLeiViaVerifier(lei: string, signal?: AbortSignal): Promise<LeiRecord> {
  const body = await requestJson(joinUrl(env.verifierUrl, `/lei/${encodeURIComponent(lei)}`), { signal })
  return fromVerifier(record(body, 'LEI record'))
}

export async function lookupLeiViaGleif(lei: string, signal?: AbortSignal): Promise<LeiRecord> {
  try {
    const body = await requestJson(`${GLEIF_API}/lei-records/${encodeURIComponent(lei)}`, {
      headers: { accept: 'application/vnd.api+json' },
      timeoutMs: 12_000,
      signal,
    })
    return fromGleif(record(body, 'GLEIF record'))
  } catch (error) {
    // Aborts and unreadable records pass through; GLEIF's own answers become the verifier's codes.
    if (!(error instanceof ApiError) || error.code === 'bad_response') throw error
    if (error.status === 404) throw new ApiError(404, 'lei_not_found', 'GLEIF has no such LEI')
    throw new ApiError(502, 'lei_unavailable', 'GLEIF could not be reached')
  }
}

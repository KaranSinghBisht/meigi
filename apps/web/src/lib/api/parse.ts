// Small runtime guards for service responses. The services are ours, but responses still cross a trust
// boundary: anything that doesn't have the expected shape becomes a clear `bad_response` error.

import { ApiError } from './http'

export type Json = Record<string, unknown>

export function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function bad(what: string): ApiError {
  return new ApiError(200, 'bad_response', `The service sent an unexpected ${what}.`)
}

export function record(value: unknown, what: string): Json {
  if (!isRecord(value)) throw bad(what)
  return value
}

export function str(body: Json, key: string, what: string): string {
  const value = body[key]
  if (typeof value !== 'string') throw bad(what)
  return value
}

export function num(body: Json, key: string, what: string): number {
  const value = body[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw bad(what)
  return value
}

export function optStr(body: Json, key: string): string | null {
  const value = body[key]
  return typeof value === 'string' ? value : null
}

export function optNum(body: Json, key: string): number | null {
  const value = body[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function hex(body: Json, key: string, what: string): `0x${string}` {
  const value = str(body, key, what)
  if (!/^0x[0-9a-fA-F]*$/.test(value)) throw bad(what)
  return value as `0x${string}`
}

/** A non-negative integer sent as a decimal string (JSON has no bigint), e.g. an EIP-712 deadline. */
export function bigintStr(body: Json, key: string, what: string): bigint {
  const value = body[key]
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value)
  if (typeof value === 'string' && /^\d{1,78}$/.test(value)) return BigInt(value)
  throw bad(what)
}

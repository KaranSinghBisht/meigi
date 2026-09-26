// Display helpers for addresses, hashes, amounts and times. Pure functions, no chain access.

const ETHERSCAN = 'https://sepolia.etherscan.io'

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`
}

export function txUrl(hash: string): string {
  return `${ETHERSCAN}/tx/${hash}`
}

export function addressUrl(address: string): string {
  return `${ETHERSCAN}/address/${address}`
}

export function blockUrl(block: bigint): string {
  return `${ETHERSCAN}/block/${block}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Seconds → "HH:MM:SS". Hours are not capped at 24, so a 72h timelock reads "71:59:59". */
export function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds % 60)}`
}

const JST = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** e.g. "29 Sept 2026, 14:05 JST" */
export function formatJst(date: Date): string {
  return `${JST.format(date)} JST`
}

const JST_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** e.g. "05:42 JST", for something that just happened. */
export function formatJstTime(date: Date): string {
  return `${JST_TIME.format(date)} JST`
}

const RELATIVE = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelative(date: Date, now: number = Date.now()): string {
  const seconds = Math.round((date.getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return RELATIVE.format(seconds, 'second')
  if (abs < 3600) return RELATIVE.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return RELATIVE.format(Math.round(seconds / 3600), 'hour')
  return RELATIVE.format(Math.round(seconds / 86400), 'day')
}

const TOKEN_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** An 18-decimal token amount (wei-style bigint) as a readable number, e.g. 1234567.5 → "1,234,567.5". */
export function formatTokenAmount(amount: bigint, decimals = 18): string {
  const scale = 10n ** BigInt(decimals)
  const whole = amount / scale
  const fraction = Number(amount % scale) / Number(scale)
  if (whole > BigInt(Number.MAX_SAFE_INTEGER)) return whole.toLocaleString('en-US')
  return TOKEN_FORMAT.format(Number(whole) + fraction)
}

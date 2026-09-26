// Shared colours, timing helpers and the fixture payee the ASCII pieces draw. The colours are the app's palette,
// tuned to read on the page's mist: ink and iris for what matters, lavender and blush for the noise around it.

export const COLOR = {
  ink: '#2a2730',
  soft: '#45414d',
  iris: '#4b3f99',
  lavender: '#8f7ee8',
  mist: '#b3a6ec',
  blush: '#d9709a',
  seal: '#c8372d',
  jade: '#1f6b4c',
} as const

/**
 * The start page's fixture payee: the company, its registered payout, a look-alike an attacker would use, and an
 * illustrative new payout the company might move to through the 72-hour change.
 */
export const PAYEE = {
  tNumber: 'T2011001234567',
  name: '株式会社メイギ商事',
  ens: 't2011001234567.payee.eth',
  payout: '0x9B4fc8994FcF2d5FE08a82A9454B61AA14D647e4',
  lookalike: '0x9b4F7A1E5C3d2B8f60E94C1D7A2b3e5F6A8047E4',
  nextPayout: '0x5e21Ac04D7B98f3e6A19C2D40b7F8E15A93c60d2',
} as const

export const HEX = '0123456789abcdef'

/** A stable pseudo-random number in [0, 1) for a cell and a tick, so noise flickers without Math.random per frame. */
export function noise(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** 0 before `from`, 1 after `to`, eased in between. */
export function progress(t: number, from: number, to: number): number {
  const x = clamp01((t - from) / (to - from))
  return x * x * (3 - 2 * x)
}

/** Draws `s` one glyph per cell, each fading in as `reveal` (0..1) sweeps left to right. */
export function sweepText(
  put: (c: number, r: number, ch: string, color: string, alpha?: number) => void,
  c: number,
  r: number,
  s: string,
  color: string,
  reveal: number,
): void {
  const edge = reveal * (s.length + 2)
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (!ch || ch === ' ') continue
    const a = clamp01(edge - i)
    if (a > 0) put(c + i, r, ch, color, a)
  }
}

// Fuji's silhouette as a pure function, shared by the mesh and the SVG
// fallback. Kept free of three.js so the fallback stays in the main bundle.

/** Crater rim radius as a fraction of the base radius (the flat top). */
export const RIM = 0.034
/** Exponent > 1 bends the flanks into Fuji's concave sweep. */
export const FLANK_EXPONENT = 2.05
/** Snow line as a fraction of height. */
export const SNOW_LINE = 0.62

/** Normalised height (0..1) of the smooth profile at normalised radius s. */
export function fujiProfile(s: number): number {
  if (s <= RIM) return 1
  const t = Math.min((s - RIM) / (1 - RIM), 1)
  return Math.pow(1 - t, FLANK_EXPONENT)
}

/** Normalised radius where the profile reaches height h (inverse of fujiProfile). */
export function fujiRadiusAt(h: number): number {
  if (h >= 1) return RIM
  if (h <= 0) return 1
  return RIM + (1 - Math.pow(h, 1 / FLANK_EXPONENT)) * (1 - RIM)
}

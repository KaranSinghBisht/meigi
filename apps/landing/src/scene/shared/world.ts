// World layout and camera framing. Units are loosely metres near the camera;
// Fuji is scaled so it sits at the right apparent size, not at true distance.

export const WORLD = {
  eyeHeight: 1.6,
  fuji: { x: 0, z: -900, baseY: -6, height: 196, radius: 600 },
  lake: { halfWidth: 900, nearZ: 6, farZ: -470 },
  cameraFar: 4200,
} as const

export interface Framing {
  /** Vertical field of view in degrees */
  readonly fov: number
  /** Upward pitch in radians that puts the horizon at `horizon` */
  readonly pitch: number
  /** Horizon position as a fraction of viewport height from the top */
  readonly horizon: number
}

const DEG = Math.PI / 180
const BASE_FOV = 34 * DEG
const MIN_HALF_HFOV = 19 * DEG

export function horizonFor(aspect: number): number {
  if (aspect < 0.8) return 0.53
  if (aspect < 1.25) return 0.57
  return 0.6
}

/** Keeps a minimum horizontal FOV on portrait screens so Fuji's flanks stay visible. */
export function framingFor(aspect: number): Framing {
  const safeAspect = Math.max(aspect, 0.2)
  const fromWidth = 2 * Math.atan(Math.tan(MIN_HALF_HFOV) / safeAspect)
  const fov = Math.max(BASE_FOV, fromWidth)
  const horizon = horizonFor(safeAspect)
  const ndcY = 1 - 2 * horizon
  const pitch = Math.atan(-ndcY * Math.tan(fov / 2))
  return { fov: fov / DEG, pitch, horizon }
}

export interface ToriiPlacement {
  readonly x: number
  readonly z: number
  /** Yaw that turns the gate to face the viewer */
  readonly rotY: number
  readonly scale: number
}

const TORII_DEPTH = 54
/** Screen position of the gate's centre in NDC: about 14% in from the left. */
const TORII_NDC_X = -0.72

/**
 * Mid-left of the frame, placed by screen position rather than world x so the
 * wordmark (whose left edge sits at ≥ 32% of the width) stays clear of it at
 * every landscape aspect. Portrait keeps it below the wordmark, left of Fuji.
 */
export function toriiPlacement(aspect: number): ToriiPlacement {
  if (aspect < 0.8) return { x: -9.2, z: -46, rotY: 0.2, scale: 1 }
  const tanHalfH = Math.tan((framingFor(aspect).fov * DEG) / 2) * aspect
  const x = TORII_DEPTH * tanHalfH * TORII_NDC_X
  return { x, z: -TORII_DEPTH, rotY: Math.atan2(-x, TORII_DEPTH) * 0.93, scale: 0.85 }
}

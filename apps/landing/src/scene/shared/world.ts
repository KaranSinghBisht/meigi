// World layout and camera framing. Units are loosely metres near the camera;
// Fuji is scaled so it sits at the right apparent size, not at true distance.

export const WORLD = {
  eyeHeight: 1.6,
  fuji: { x: 0, z: -900, baseY: -6, height: 196, radius: 600 },
  lake: { halfWidth: 900, nearZ: 6, farZ: -470 },
  cameraFar: 4200,
} as const

export interface ToriiPlacement {
  readonly x: number
  readonly z: number
  /** Yaw that turns the gate to face the viewer */
  readonly rotY: number
}

/** Mid-left of the frame; nearer the centre on portrait screens so it isn't cropped. */
export function toriiPlacement(aspect: number): ToriiPlacement {
  if (aspect < 0.8) return { x: -9.2, z: -46, rotY: 0.2 }
  return { x: -15.5, z: -54, rotY: 0.26 }
}

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

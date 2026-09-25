import { Color, Vector3 } from 'three'

// Dawn palette. Hex values are sRGB; THREE.Color converts them to linear
// working space, which is what the shaders mix in.
export const HEX = {
  zenith: '#B9B4E6',
  pink: '#F2C4D3',
  horizon: '#FFE3C8',
  fujiLow: '#8D8FC4',
  fujiHigh: '#A7A3D6',
  deepWater: '#9C9CCB',
  vermilion: '#E0452B',
  lacquerBlack: '#221D24',
  charcoal: '#2A2730',
  snow: '#FBF6F7',
  petal: '#F2A2BC',
} as const

export function color(hex: string): Color {
  return new Color(hex)
}

/** Direction the sunlight comes from: low in the east, left of the frame. */
export const SUN_DIR = new Vector3(-0.93, 0.2, 0.3).normalize()

/** Where the visible glow sits in the sky: low, just left of the torii. */
export const GLOW_DIR = new Vector3(-0.36, 0.035, -0.93).normalize()

export const SUN_COLOR = new Color('#FFD7B8')

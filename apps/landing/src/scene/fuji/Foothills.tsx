import { useEffect, useMemo } from 'react'
import { DoubleSide, ShaderMaterial } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { HEX, SUN_DIR, color } from '../shared/palette'
import { createFoothillsGeometry, type RidgeLayer } from './foothillsGeometry'

// Nearest first; each layer is lighter and hazier than the one in front.
const LAYERS: readonly RidgeLayer[] = [
  { z: -180, base: 1.2, amp: 5.5, scale: 34, seed: 3, color: '#8C86B6', centerDip: 4, canopy: 0.9 },
  { z: -255, base: 3, amp: 9, scale: 55, seed: 11, color: '#A29AC7', centerDip: 5, canopy: 1.1 },
  { z: -345, base: 5, amp: 13, scale: 80, seed: 23, color: '#B9AFD6', centerDip: 6, canopy: 1.3 },
]

const vertexShader = /* glsl */ `
  attribute float aTop;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying float vTop;
  void main() {
    vColor = color;
    vTop = aTop;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uHaze;
  uniform vec3 uSunDir;
  varying vec3 vColor;
  varying vec3 vWorld;
  varying float vTop;

  ${NOISE_GLSL}

  void main() {
    float canopy = vnoise(vWorld.xy * vec2(0.9, 1.6)) * 0.08;
    vec3 col = vColor * (0.94 + canopy);
    // Sun from the left warms the ridges on that side a little.
    col = mix(col, col * vec3(1.12, 1.0, 0.96), smoothstep(80.0, -260.0, vWorld.x) * 0.35);
    // Mist pools near the water line.
    float mist = 1.0 - smoothstep(0.0, 7.0, vWorld.y);
    float dist = length(vWorld - cameraPosition);
    float haze = 1.0 - exp(-dist * 0.0022);
    col = mix(col, uHaze, clamp(haze * 0.45 + mist * 0.35, 0.0, 0.9));
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`

export function Foothills() {
  const geometry = useMemo(() => createFoothillsGeometry(LAYERS), [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uHaze: { value: color(HEX.horizon) },
          uSunDir: { value: SUN_DIR.clone() },
        },
        vertexShader,
        fragmentShader,
        vertexColors: true,
        side: DoubleSide,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return <mesh geometry={geometry} material={material} matrixAutoUpdate={false} />
}

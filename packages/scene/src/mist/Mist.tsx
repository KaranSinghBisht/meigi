import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ShaderMaterial, type Mesh } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { color } from '../shared/palette'
import { useStationPose } from '../camera/useStationPose'
import { FRAME, sceneBus } from '../shared/sceneBus'
import type { Station } from '../types'
import { frameClock } from '../shared/frameClock'

interface MistLayer {
  readonly z: number
  readonly height: number
  readonly opacity: number
  readonly drift: number
  readonly seed: number
  /** Only drawn while the 'frozen' mood rolls mist in close. */
  readonly frozenOnly?: boolean
}

// Far to near. Each curtain starts just below the water so its foot is hidden.
const LAYERS: readonly MistLayer[] = [
  { z: -250, height: 18, opacity: 0.55, drift: 0.004, seed: 1.7 },
  { z: -175, height: 13, opacity: 0.5, drift: -0.006, seed: 7.3 },
  { z: -110, height: 8, opacity: 0.38, drift: 0.009, seed: 3.1 },
  { z: -62, height: 4.5, opacity: 0.26, drift: -0.012, seed: 5.9 },
  { z: -26, height: 3.6, opacity: 0.5, drift: 0.016, seed: 9.4, frozenOnly: true },
]

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// uFrozen thickens the wisps, lifts them higher and makes them denser.
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDrift;
  uniform float uSeed;
  uniform float uAspect;
  uniform float uOpacity;
  uniform float uFrozen;
  uniform vec3 uLight;
  uniform vec3 uShade;
  varying vec2 vUv;

  ${NOISE_GLSL}

  void main() {
    vec2 p = vec2(vUv.x * uAspect * 0.32 + uTime * uDrift * uAspect + uSeed, vUv.y * 1.6 + uSeed);
    float n = fbm(p);
    float wisps = smoothstep(0.3 - 0.14 * uFrozen, 0.78, n);
    float foot = smoothstep(0.02, 0.14, vUv.y);
    float fall = 1.0 - smoothstep(0.18 + 0.38 * uFrozen, 0.95, vUv.y);
    float sides = smoothstep(0.0, 0.07, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x));
    float alpha = wisps * foot * fall * sides * uOpacity * (1.0 + 1.3 * uFrozen);
    vec3 col = mix(uShade, uLight, clamp(vUv.y * 0.5 + n * 0.6, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    ${OUTPUT_GLSL}
  }
`

function createMistUniforms(layer: MistLayer, width: number) {
  return {
    uTime: { value: 0 },
    uDrift: { value: layer.drift },
    uSeed: { value: layer.seed },
    uAspect: { value: width / layer.height },
    uOpacity: { value: layer.frozenOnly ? 0 : layer.opacity },
    uFrozen: { value: 0 },
    uLight: { value: color('#FFF3EA') },
    uShade: { value: color('#E9D6E6') },
  }
}

type MistUniforms = ReturnType<typeof createMistUniforms>

function createMistMaterial(uniforms: MistUniforms): ShaderMaterial {
  return new ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false })
}

interface MistCurtain {
  readonly layer: MistLayer
  readonly width: number
  readonly uniforms: MistUniforms
  readonly material: ShaderMaterial
}

function useMistCurtains(): readonly MistCurtain[] {
  const curtains = useMemo(
    () =>
      LAYERS.map((layer) => {
        const width = Math.abs(layer.z) * 2.3 + 60
        const uniforms = createMistUniforms(layer, width)
        return { layer, width, uniforms, material: createMistMaterial(uniforms) }
      }),
    [],
  )
  useEffect(() => () => curtains.forEach(({ material }) => material.dispose()), [curtains])
  return curtains
}

/**
 * Drift (faster while the 'frozen' mist is rolling in or out) and mood density.
 * While `warming`, the frozen-only curtain draws at zero opacity so its shader
 * compiles at startup rather than on the first 'frozen' mood.
 */
function updateMist(curtains: readonly MistCurtain[], meshes: ReadonlyArray<Mesh | null>, dt: number, warming: boolean): void {
  const mood = sceneBus.mood
  const step = dt * (1 + 3 * Math.abs(mood.mistTarget - mood.mist))
  curtains.forEach(({ layer, uniforms }, index) => {
    uniforms.uTime.value += step
    uniforms.uFrozen.value = mood.mist
    if (!layer.frozenOnly) return
    uniforms.uOpacity.value = layer.opacity * mood.mist
    const mesh = meshes[index]
    if (mesh) mesh.visible = warming || mood.mist > 0.01
  })
}

interface MistProps {
  readonly station: Station
  readonly animate: boolean
}

export function Mist({ station, animate }: MistProps) {
  const meshes = useRef<Array<Mesh | null>>([])
  const curtains = useMistCurtains()
  // The frozen-only curtain rolls in just in front of whichever station is active.
  const anchor = useStationPose(station).position
  const frames = useRef(0)

  useFrame(() => {
    frames.current += 1
    updateMist(curtains, meshes.current, animate ? frameClock.dt : 0, frames.current <= 2)
  }, FRAME.animate)

  return (
    <group>
      {curtains.map(({ layer, width, material }, index) => (
        <mesh
          key={layer.z}
          ref={(mesh) => {
            meshes.current[index] = mesh
          }}
          material={material}
          position={
            layer.frozenOnly ? [anchor.x, layer.height / 2 - 1, anchor.z + layer.z] : [0, layer.height / 2 - 1, layer.z]
          }
          renderOrder={2}
          visible={!layer.frozenOnly}
        >
          <planeGeometry args={[width, layer.height]} />
        </mesh>
      ))}
    </group>
  )
}

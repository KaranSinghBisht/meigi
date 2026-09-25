import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { ShaderMaterial } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { color } from '../shared/palette'
import { FRAME } from '../shared/sceneBus'

interface MistLayer {
  readonly z: number
  readonly height: number
  readonly opacity: number
  readonly drift: number
  readonly seed: number
}

// Far to near. Each curtain starts just below the water so its foot is hidden.
const LAYERS: readonly MistLayer[] = [
  { z: -250, height: 18, opacity: 0.55, drift: 0.004, seed: 1.7 },
  { z: -175, height: 13, opacity: 0.5, drift: -0.006, seed: 7.3 },
  { z: -110, height: 8, opacity: 0.38, drift: 0.009, seed: 3.1 },
  { z: -62, height: 4.5, opacity: 0.26, drift: -0.012, seed: 5.9 },
]

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uDrift;
  uniform float uSeed;
  uniform float uAspect;
  uniform float uOpacity;
  uniform vec3 uLight;
  uniform vec3 uShade;
  varying vec2 vUv;

  ${NOISE_GLSL}

  void main() {
    vec2 p = vec2(vUv.x * uAspect * 0.32 + uTime * uDrift * uAspect + uSeed, vUv.y * 1.6 + uSeed);
    float n = fbm(p);
    float wisps = smoothstep(0.3, 0.78, n);
    float foot = smoothstep(0.02, 0.14, vUv.y);
    float fall = 1.0 - smoothstep(0.18, 0.95, vUv.y);
    float sides = smoothstep(0.0, 0.07, vUv.x) * (1.0 - smoothstep(0.93, 1.0, vUv.x));
    float alpha = wisps * foot * fall * sides * uOpacity;
    vec3 col = mix(uShade, uLight, clamp(vUv.y * 0.5 + n * 0.6, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    ${OUTPUT_GLSL}
  }
`

function createMistMaterial(layer: MistLayer, width: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDrift: { value: layer.drift },
      uSeed: { value: layer.seed },
      uAspect: { value: width / layer.height },
      uOpacity: { value: layer.opacity },
      uLight: { value: color('#FFF3EA') },
      uShade: { value: color('#E9D6E6') },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  })
}

interface MistProps {
  readonly animate: boolean
}

export function Mist({ animate }: MistProps) {
  const layers = useMemo(
    () =>
      LAYERS.map((layer) => {
        const width = Math.abs(layer.z) * 2.3 + 60
        return { layer, width, material: createMistMaterial(layer, width) }
      }),
    [],
  )

  useEffect(() => () => layers.forEach(({ material }) => material.dispose()), [layers])

  useFrame((_, delta) => {
    if (!animate) return
    const step = Math.min(delta, 0.1)
    for (const { material } of layers) material.uniforms.uTime.value += step
  }, FRAME.animate)

  return (
    <group>
      {layers.map(({ layer, width, material }) => (
        <mesh key={layer.z} material={material} position={[0, layer.height / 2 - 1, layer.z]} renderOrder={2}>
          <planeGeometry args={[width, layer.height]} />
        </mesh>
      ))}
    </group>
  )
}

import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { ShaderMaterial } from 'three'
import { OUTPUT_GLSL } from '../shared/glsl'
import { HEX, SUN_COLOR, SUN_DIR, color } from '../shared/palette'
import { toriiPlacement } from '../shared/world'
import { createToriiGeometry } from './toriiGeometry'

const vertexShader = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vColor = color;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// Lacquer: soft wrapped diffuse, a sky/water ambient split, and a tight
// specular that pushes past 1.0 so bloom picks up the glint.
const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyAmbient;
  uniform vec3 uWaterAmbient;
  uniform vec3 uHaze;
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    float wrap = clamp((dot(n, uSunDir) + 0.2) / 1.2, 0.0, 1.0);
    vec3 ambient = mix(uWaterAmbient, uSkyAmbient, 0.5 + 0.5 * n.y);
    vec3 col = vColor * (ambient * 0.42 + uSunColor * wrap * 0.95);

    vec3 hv = normalize(uSunDir + v);
    float gloss = pow(max(dot(n, hv), 0.0), 70.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
    col += uSunColor * gloss * 1.6 + uSkyAmbient * fres * 0.12;

    float mist = 1.0 - smoothstep(0.0, 1.4, vWorld.y);
    col = mix(col, uHaze, mist * 0.18);
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`

export function Torii() {
  const size = useThree((state) => state.size)
  const geometry = useMemo(createToriiGeometry, [])
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uSunDir: { value: SUN_DIR.clone() },
          uSunColor: { value: SUN_COLOR.clone() },
          uSkyAmbient: { value: color('#E9D3EA') },
          uWaterAmbient: { value: color('#C9BEDD') },
          uHaze: { value: color(HEX.horizon) },
        },
        vertexShader,
        fragmentShader,
        vertexColors: true,
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

  const { x, z, rotY } = toriiPlacement(size.width / Math.max(size.height, 1))
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[x, 0, z]}
      rotation={[0, rotY, 0]}
    />
  )
}

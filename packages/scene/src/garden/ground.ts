import { PlaneGeometry, ShaderMaterial, Vector4 } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { HEX, color } from '../shared/palette'
import type { ShoreShape } from './shore'

// The near shore under the beds: soft bedding in sage with a lavender cast,
// fading into the dawn haze with distance, and a low grey-beige stone edge at
// the water, mostly hidden by the fringe of foliage along it.

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec4 uShore; // head, side, coveHalf, bend
  uniform float uWobble;
  uniform vec3 uSage;
  uniform vec3 uLavender;
  uniform vec3 uDamp;
  uniform vec3 uStone;
  uniform vec3 uHaze;
  varying vec3 vWorld;
  ${NOISE_GLSL}

  float shoreZ(float x) {
    float wander = 0.55 * sin(x * 1.3 + 0.7) + 0.3 * sin(x * 2.9 + 2.1) + 0.15 * sin(x * 6.1 + 0.3);
    return uShore.x + (uShore.y - uShore.x) * smoothstep(uShore.z, uShore.w, abs(x)) + uWobble * wander;
  }

  void main() {
    float slope = (shoreZ(vWorld.x + 0.01) - shoreZ(vWorld.x - 0.01)) / 0.02;
    // Distance inland from the water, square to the edge.
    float inland = (vWorld.z - shoreZ(vWorld.x)) / sqrt(1.0 + slope * slope);
    if (inland <= 0.0) discard;
    float broad = fbm(vWorld.xz * 0.45);
    float fine = fbm(vWorld.xz * 3.2);
    vec3 col = mix(uSage, uLavender, smoothstep(0.35, 0.75, broad)) * (0.84 + 0.22 * fine);
    col = mix(uDamp, col, smoothstep(0.25, 1.6, inland));
    // Stone blocks along the water: weathered, with dark joints.
    float joint = 1.0 - smoothstep(0.0, 0.03, abs(fract(vWorld.x * 1.3 + fine * 0.25) - 0.5) - 0.465);
    vec3 stone = uStone * (0.8 + 0.28 * fbm(vWorld.xz * 11.0)) * (1.0 - 0.3 * joint);
    stone *= 0.82 + 0.18 * smoothstep(0.0, 0.06, inland);
    col = mix(stone, col, smoothstep(0.22, 0.27, inland));
    float far = length(vWorld.xz - cameraPosition.xz);
    col = mix(col, uHaze, smoothstep(6.0, 70.0, far) * 0.6);
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`

export function createGroundMaterial(shore: ShoreShape): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uShore: { value: new Vector4(shore.head, shore.side, shore.coveHalf, shore.bend) },
      uWobble: { value: shore.wobble },
      uSage: { value: color('#A4AE96') },
      uLavender: { value: color('#ADA6BE') },
      uDamp: { value: color('#8C8A94') },
      uStone: { value: color('#B7AEA4') },
      uHaze: { value: color(HEX.horizon) },
    },
    vertexShader,
    fragmentShader,
  })
}

/** A flat sheet just above the water, from the lake's edge back past the shore station. */
export function createGroundGeometry(shore: ShoreShape): PlaneGeometry {
  const near = 70
  const far = shore.side - 1
  const geometry = new PlaneGeometry(260, near - far)
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, 0.04, (near + far) / 2)
  return geometry
}

import { PlaneGeometry, ShaderMaterial, Vector4 } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { HEX, color } from '../shared/palette'
import type { ShoreShape } from './shore'

// The near shore under the beds: soft bedding in sage with a lavender cast,
// darker and damper towards the water, fading into the dawn haze with
// distance. No paths or edges: the foliage along the bank hides the cut.

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
  uniform vec3 uSage;
  uniform vec3 uLavender;
  uniform vec3 uDamp;
  uniform vec3 uHaze;
  varying vec3 vWorld;
  ${NOISE_GLSL}

  float shoreZ(float x) {
    return uShore.x + (uShore.y - uShore.x) * smoothstep(uShore.z, uShore.w, abs(x));
  }

  void main() {
    float slope = (shoreZ(vWorld.x + 0.01) - shoreZ(vWorld.x - 0.01)) / 0.02;
    // Distance inland from the water, square to the edge.
    float inland = (vWorld.z - shoreZ(vWorld.x)) / sqrt(1.0 + slope * slope);
    if (inland <= 0.0) discard;
    float broad = fbm(vWorld.xz * 0.45);
    float fine = fbm(vWorld.xz * 3.2);
    vec3 col = mix(uSage, uLavender, smoothstep(0.35, 0.75, broad)) * (0.84 + 0.22 * fine);
    col = mix(uDamp, col, smoothstep(0.0, 1.6, inland));
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
      uSage: { value: color('#A4AE96') },
      uLavender: { value: color('#ADA6BE') },
      uDamp: { value: color('#8C8A94') },
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

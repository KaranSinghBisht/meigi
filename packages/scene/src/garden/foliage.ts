import { Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, ShaderMaterial, type Texture } from 'three'
import { OUTPUT_GLSL } from '../shared/glsl'
import { HEX, SUN_COLOR, color } from '../shared/palette'

// Low, feathery bedding that carpets the bank: soft clumps in sage greens
// with a lavender cast, darker at the foot, catching the dawn on their tops.
// It hides the flowers' stems and softens the water's edge.

const vertexShader = /* glsl */ `
  attribute vec4 aTuft;  // x, z, height, width
  attribute vec2 aShade; // tint, seed
  uniform float uTime;
  varying vec2 vUv;
  varying float vTint;
  varying float vSoft;
  varying float vFar;
  void main() {
    vUv = position.xy + 0.5;
    vTint = aShade.x;
    vec3 root = vec3(aTuft.x, 0.0, aTuft.y);
    vec3 toCam = cameraPosition - root;
    float dist = length(toCam);
    vSoft = smoothstep(8.0, 3.0, dist);
    vFar = smoothstep(14.0, 60.0, dist);
    toCam.y = 0.0;
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(toCam)));
    float sway = sin(uTime * 0.9 + aShade.y * 6.28) * 0.02 * vUv.y * vUv.y;
    vec3 world = root + right * (position.x * aTuft.w + sway) + vec3(0.0, vUv.y * aTuft.z - 0.05, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uClump;
  uniform vec3 uSage;
  uniform vec3 uMoss;
  uniform vec3 uLavender;
  uniform vec3 uSunColor;
  uniform vec3 uHaze;
  varying vec2 vUv;
  varying float vTint;
  varying float vSoft;
  varying float vFar;
  void main() {
    vec4 paint = texture2D(uClump, vUv, vSoft * 2.2);
    if (paint.a < 0.02) discard;
    vec3 leaf = mix(uMoss, uSage, smoothstep(0.2, 0.8, vTint));
    leaf = mix(leaf, uLavender, smoothstep(0.65, 1.0, vTint) * 0.55);
    vec3 col = leaf * (0.55 + 0.45 * paint.r) * (0.82 + 0.3 * paint.g);
    col += uSunColor * 0.07 * smoothstep(0.75, 1.0, paint.r);
    col = mix(col, uHaze, vFar * 0.5);
    gl_FragColor = vec4(col, paint.a * (1.0 - 0.3 * vSoft));
    ${OUTPUT_GLSL}
  }
`

export function createFoliageMaterial(clump: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uClump: { value: clump },
      uSage: { value: color('#98A787') },
      uMoss: { value: color('#71866A') },
      uLavender: { value: color('#A49BB8') },
      uSunColor: { value: SUN_COLOR.clone() },
      uHaze: { value: color(HEX.horizon) },
    },
    vertexShader,
    fragmentShader,
    alphaToCoverage: true,
  })
}

export function createFoliageGeometry(tufts: Float32Array, shades: Float32Array): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3))
  geometry.setAttribute('aTuft', new InstancedBufferAttribute(tufts, 4))
  geometry.setAttribute('aShade', new InstancedBufferAttribute(shades, 2))
  geometry.instanceCount = Math.floor(shades.length / 2)
  return geometry
}

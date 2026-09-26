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
  varying float vFar;
  void main() {
    vUv = position.xy + 0.5;
    // Mirror every other clump so the strands never read as one repeating hatch.
    if (fract(aShade.y * 7.0) > 0.5) vUv.x = 1.0 - vUv.x;
    vTint = aShade.x;
    vec3 root = vec3(aTuft.x, 0.0, aTuft.y);
    vec3 toCam = cameraPosition - root;
    float dist = length(toCam);
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
  uniform float uTipLight;
  varying vec2 vUv;
  varying float vTint;
  varying float vFar;
  void main() {
    vec4 paint = texture2D(uClump, vUv);
    if (paint.a < 0.45) discard;
    vec3 leaf = mix(uMoss, uSage, smoothstep(0.2, 0.8, vTint));
    leaf = mix(leaf, uLavender, smoothstep(0.65, 1.0, vTint) * 0.25);
    // Tops catch the light; uTipLight tones that down where it would read as chalky hatching.
    vec3 col = leaf * (1.0 - 0.2 * uTipLight + 0.2 * uTipLight * paint.r) * (0.97 + 0.05 * paint.g);
    col += uSunColor * 0.015 * uTipLight * smoothstep(0.75, 1.0, paint.r);
    col = mix(col, uHaze, vFar * 0.5);
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`

/** `tipLight` scales the light on the clump tops (1 full, lower on phones, where clumps are big on screen). */
export function createFoliageMaterial(clump: Texture, tipLight: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uClump: { value: clump },
      uSage: { value: color('#788B65') },
      uMoss: { value: color('#4E6749') },
      uLavender: { value: color('#8A947F') },
      uSunColor: { value: SUN_COLOR.clone() },
      uHaze: { value: color(HEX.horizon) },
      uTipLight: { value: tipLight },
    },
    vertexShader,
    fragmentShader,
    alphaToCoverage: false,
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

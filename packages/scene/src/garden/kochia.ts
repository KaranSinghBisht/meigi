import { IcosahedronGeometry, InstancedBufferAttribute, Matrix4, Quaternion, ShaderMaterial, Vector3 } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { HEX, SUN_COLOR, SUN_DIR, color } from '../shared/palette'

// Kochia (ほうき草): round, fluffy domes turning from summer green to autumn
// crimson. A lumpy sphere, shaded as a soft ball of fine foliage: light
// wrapping round from the low sun, dark at the foot, a pale fuzzy rim.

const vertexShader = /* glsl */ `
  attribute float aTint;
  attribute float aSeed;
  varying float vTint;
  varying float vHeight;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  ${NOISE_GLSL}
  void main() {
    vTint = aTint;
    vec3 p = position;
    // Irregular, hedge-trimmed domes: broad lumps, a flatter foot, fine fuzz.
    float lump = fbm3(p.xz * 1.7 + p.y * 1.3 + aSeed * 11.0) - 0.5;
    float fuzz = vnoise(p.xz * 13.0 + p.y * 11.0 + aSeed * 5.0) - 0.5;
    p += normal * (lump * 0.26 + fuzz * 0.07);
    p.y = max(p.y, -0.7);
    vLocal = p;
    vHeight = p.y * 0.5 + 0.5;
    mat4 model = modelMatrix * instanceMatrix;
    vec4 world = model * vec4(p, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// Matte and soft: wrapped light, no highlight, and a silhouette that frays
// into coverage noise (alpha to coverage) so the rim reads as fine foliage.
const fragmentShader = /* glsl */ `
  uniform vec3 uChartreuse;
  uniform vec3 uCoral;
  uniform vec3 uCrimson;
  uniform vec3 uMagenta;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  uniform vec3 uGround;
  uniform vec3 uRim;
  uniform vec3 uHaze;
  varying float vTint;
  varying float vHeight;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vLocal;
  ${NOISE_GLSL}

  vec3 season(float t) {
    vec3 c = mix(uChartreuse, uCoral, smoothstep(0.0, 0.45, t));
    c = mix(c, uCrimson, smoothstep(0.4, 0.75, t));
    return mix(c, uMagenta, smoothstep(0.75, 1.0, t));
  }

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    float leaves = fbm(vLocal.xz * 26.0 + vLocal.y * 31.0);
    float clumps = fbm3(vLocal.xz * 6.0 + vLocal.y * 7.0);
    float texture = smoothstep(0.2, 0.85, leaves * 0.7 + clumps * 0.5);
    // Each dome turns from the top down.
    vec3 base = season(clamp(vTint + (vHeight - 0.55) * 0.3, 0.0, 1.0)) * (0.66 + 0.48 * texture);
    float wrap = clamp((dot(n, uSunDir) + 0.7) / 1.7, 0.0, 1.0);
    vec3 ambient = mix(uGround, uSky, 0.5 + 0.5 * n.y);
    float foot = smoothstep(0.0, 0.4, vHeight);
    vec3 col = base * (ambient * 0.7 + uSunColor * wrap * 0.42) * (0.5 + 0.5 * foot);
    float edge = 1.0 - max(dot(n, v), 0.0);
    col = mix(col, uRim * (0.8 + 0.2 * texture), pow(edge, 2.0) * 0.1);
    col = mix(col, uHaze, smoothstep(12.0, 70.0, length(cameraPosition - vWorld)) * 0.45);
    float fray = smoothstep(0.55, 0.95, edge) * (0.35 + 0.65 * leaves);
    gl_FragColor = vec4(col, 1.0 - fray);
    ${OUTPUT_GLSL}
  }
`

export function createKochiaMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uChartreuse: { value: color('#B8C46A') },
      uCoral: { value: color('#EE9A7E') },
      uCrimson: { value: color('#CF4F66') },
      uMagenta: { value: color('#B9487F') },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: SUN_COLOR.clone() },
      uSky: { value: color('#EBD8EC') },
      uGround: { value: color('#8C7F86') },
      uRim: { value: color('#FBE3EC') },
      uHaze: { value: color(HEX.horizon) },
    },
    vertexShader,
    fragmentShader,
    alphaToCoverage: true,
  })
}

/** Unit sphere with per-dome tint and seed attributes for `count` instances. */
export function createKochiaGeometry(tints: Float32Array, compact: boolean): IcosahedronGeometry {
  const geometry = new IcosahedronGeometry(1, compact ? 2 : 3)
  const seeds = new Float32Array(tints.length).map((_, i) => (i * 0.6180339) % 1)
  geometry.setAttribute('aTint', new InstancedBufferAttribute(tints, 1))
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
  return geometry
}

/** Instance matrices from x, z, radius, height quadruples: domes resting on the ground. */
export function kochiaMatrices(domes: Float32Array): Matrix4[] {
  const matrices: Matrix4[] = []
  const turn = new Quaternion()
  for (let i = 0; i + 3 < domes.length; i += 4) {
    const radius = domes[i + 2] ?? 0.4
    const height = domes[i + 3] ?? 0.5
    const position = new Vector3(domes[i] ?? 0, height * 0.42, domes[i + 1] ?? 0)
    turn.setFromAxisAngle(new Vector3(0, 1, 0), i * 1.7)
    matrices.push(new Matrix4().compose(position, turn, new Vector3(radius, height * 0.5, radius)))
  }
  return matrices
}

import { DoubleSide, ShaderMaterial } from 'three'
import { OUTPUT_GLSL } from '../shared/glsl'
import { GLOW_DIR, HEX, SUN_DIR, color } from '../shared/palette'

const vertexShader = /* glsl */ `
  attribute float aFade;
  varying vec2 vUv;
  varying float vFade;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vFade = aFade;
    mat4 model = modelMatrix * instanceMatrix;
    vec4 world = model * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(model) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

// Thin petals: front light from the sun plus light passing through from the
// dawn glow behind them, so they read as luminous rather than flat pink.
const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uSunDir;
  uniform vec3 uGlowDir;
  varying vec2 vUv;
  varying float vFade;
  varying vec3 vNormalW;
  varying vec3 vWorld;

  void main() {
    if (vFade <= 0.002) discard;
    vec3 n = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 base = mix(uBase, uTip, smoothstep(0.05, 0.85, vUv.y));
    float front = 0.62 + 0.38 * max(dot(n, uSunDir), 0.0);
    float through = pow(max(dot(-v, uGlowDir), 0.0), 3.0) * 0.35;
    vec3 col = base * (front + through);
    gl_FragColor = vec4(col, vFade);
    ${OUTPUT_GLSL}
  }
`

export function createPetalMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uBase: { value: color(HEX.petal) },
      uTip: { value: color('#FDE6EE') },
      uSunDir: { value: SUN_DIR.clone() },
      uGlowDir: { value: GLOW_DIR.clone() },
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  })
}

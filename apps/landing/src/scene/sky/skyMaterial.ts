import { BackSide, ShaderMaterial } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { GLOW_DIR, HEX, color } from '../shared/palette'

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uPink;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uGlowDir;
  uniform float uTime;
  varying vec3 vDir;

  ${NOISE_GLSL}

  vec3 skyGradient(float e) {
    vec3 col = mix(uHorizon, uPink, smoothstep(-0.02, 0.13, e));
    return mix(col, uZenith, smoothstep(0.1, 0.4, e));
  }

  float cloudBands(vec3 d, float e) {
    vec2 p = d.xz / max(e + 0.1, 0.05);
    p *= vec2(0.22, 1.1);
    p.x += uTime * 0.006;
    float n = fbm(p + vec2(3.1, 0.0));
    float thin = fbm(p * vec2(0.6, 2.6) - vec2(uTime * 0.004, 1.7));
    float band = smoothstep(0.52, 0.78, n) * 0.8 + smoothstep(0.58, 0.8, thin) * 0.45;
    return band * smoothstep(0.02, 0.1, e) * (1.0 - smoothstep(0.34, 0.66, e));
  }

  void main() {
    vec3 d = normalize(vDir);
    float e = d.y;
    vec3 col = skyGradient(e);

    float g = max(dot(d, uGlowDir), 0.0);
    float halo = pow(g, 8.0) * 0.32 + pow(g, 60.0) * 0.7 + pow(g, 1400.0) * 4.0;
    col += uGlow * halo;

    float clouds = cloudBands(d, e);
    vec3 lit = mix(vec3(1.0, 0.94, 0.93), uGlow, 0.25 * pow(g, 4.0));
    vec3 cloudCol = mix(uPink * 1.02, lit, 0.55);
    col = mix(col, cloudCol, clouds * 0.55);

    // Below the horizon only the far shore haze is ever visible.
    col = mix(col, uHorizon, smoothstep(0.0, -0.05, e));
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`

export function createSkyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uZenith: { value: color(HEX.zenith) },
      uPink: { value: color(HEX.pink) },
      uHorizon: { value: color(HEX.horizon) },
      uGlow: { value: color('#FFD2B0') },
      uGlowDir: { value: GLOW_DIR.clone() },
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
}

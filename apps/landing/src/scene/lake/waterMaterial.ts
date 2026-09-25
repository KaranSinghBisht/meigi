import { Matrix4, ShaderMaterial, Vector2, Vector4, type Texture } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { GLOW_DIR, HEX, color } from '../shared/palette'

const vertexShader = /* glsl */ `
  uniform mat4 uTextureMatrix;
  varying vec4 vReflCoord;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vReflCoord = uTextureMatrix * world;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uReflection;
  uniform sampler2D uRipple;
  uniform vec4 uMap;
  uniform vec2 uOrigin;
  uniform vec2 uSimTexel;
  uniform vec2 uFocal;
  uniform float uTime;
  uniform float uRippleGain;
  uniform float uWindGain;
  uniform vec3 uDeep;
  uniform vec3 uHaze;
  uniform vec3 uGlowDir;
  uniform vec3 uGlow;
  varying vec4 vReflCoord;
  varying vec3 vWorld;

  ${NOISE_GLSL}

  vec2 simUv(vec2 p, float d) {
    return vec2(0.5 + (p.x - uOrigin.x) / (d * uMap.x), (1.0 / d - uMap.z) / (uMap.y - uMap.z));
  }

  // World-space slope (dh/dx, dh/dz) of the simulated ripples.
  vec2 rippleSlope(vec2 uv, float d) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec2(0.0);
    float l = texture2D(uRipple, uv - vec2(uSimTexel.x, 0.0)).r;
    float r = texture2D(uRipple, uv + vec2(uSimTexel.x, 0.0)).r;
    float dn = texture2D(uRipple, uv - vec2(0.0, uSimTexel.y)).r;
    float up = texture2D(uRipple, uv + vec2(0.0, uSimTexel.y)).r;
    float dx = d * uMap.x * uSimTexel.x;
    float dz = d * d * (uMap.y - uMap.z) * uSimTexel.y;
    return vec2((r - l) / (2.0 * dx), (up - dn) / (2.0 * dz));
  }

  // Calm-water swell. Each component fades out before it gets finer than a few
  // pixels on screen, so the far water stays a clean mirror of Fuji.
  vec2 windSlope(vec2 p, float d, vec2 sim) {
    float f1 = 1.0 - smoothstep(18.0, 60.0, d);
    float f2 = 1.0 - smoothstep(9.0, 30.0, d);
    float f3 = 1.0 - smoothstep(4.0, 14.0, d);
    float a1 = sin(p.y * 1.1 + p.x * 0.2 + uTime * 0.8) * f1;
    float a2 = sin(p.y * 2.3 - p.x * 0.35 - uTime * 1.2 + 1.3) * f2;
    float a3 = sin(p.y * 4.4 + p.x * 0.7 + uTime * 1.9 + 4.0) * f3;
    vec2 s = vec2(0.0003 * a1 - 0.0002 * a3, 0.0008 * a1 + 0.0006 * a2 + 0.0005 * a3);
    // Far field: a slow shimmer laid out in screen-like sim space, so it
    // never aliases no matter how deep the water gets.
    float shimmer = vnoise(vec2(sim.x * 16.0 + uTime * 0.05, sim.y * 70.0 - uTime * 0.5)) - 0.5;
    s.y += shimmer * 0.0008;
    return s * uWindGain;
  }

  void main() {
    float d = max(uOrigin.y - vWorld.z, 0.05);
    vec2 sim = simUv(vWorld.xz, d);
    vec2 slope = rippleSlope(sim, d) * uRippleGain + windSlope(vWorld.xz, d, sim);

    // A tilted facet deflects the reflected ray by twice its tilt.
    vec2 uv = vReflCoord.xy / vReflCoord.w;
    uv += vec2(slope.x * uFocal.x, slope.y * uFocal.y) * 2.0;
    vec3 reflection = texture2D(uReflection, clamp(uv, vec2(0.001), vec2(0.999))).rgb;

    vec3 n = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 v = normalize(cameraPosition - vWorld);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 col = mix(uDeep, reflection * 0.95, mix(0.74, 1.0, fres));

    float glint = pow(max(dot(n, normalize(uGlowDir + v)), 0.0), 700.0);
    col += uGlow * glint * 0.9;

    float haze = smoothstep(90.0, 320.0, d);
    col = mix(col, uHaze, haze * 0.35);
    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`

export interface WaterUniformSources {
  readonly reflection: Texture
  readonly textureMatrix: Matrix4
  readonly simSize: number
}

export function createWaterMaterial(sources: WaterUniformSources): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uReflection: { value: sources.reflection },
      uRipple: { value: null },
      uTextureMatrix: { value: sources.textureMatrix },
      uMap: { value: new Vector4(1, 0.2, 0.002, 0) },
      uOrigin: { value: new Vector2() },
      uSimTexel: { value: new Vector2(1 / sources.simSize, 1 / sources.simSize) },
      uFocal: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uRippleGain: { value: 1 },
      uWindGain: { value: 1 },
      uDeep: { value: color(HEX.deepWater) },
      uHaze: { value: color(HEX.horizon) },
      uGlowDir: { value: GLOW_DIR.clone() },
      uGlow: { value: color('#FFD6B8') },
    },
    vertexShader,
    fragmentShader,
  })
}

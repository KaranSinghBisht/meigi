import { ShaderMaterial, Vector3 } from 'three'
import { NOISE_GLSL, OUTPUT_GLSL } from '../shared/glsl'
import { HEX, SUN_DIR, color } from '../shared/palette'
import type { FujiShape } from './fujiGeometry'
import { SNOW_LINE } from './fujiProfile'

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uBodyLow;
  uniform vec3 uBodyHigh;
  uniform vec3 uBodyLit;
  uniform vec3 uSnow;
  uniform vec3 uSnowShade;
  uniform vec3 uAlpen;
  uniform vec3 uHaze;
  uniform vec3 uCenter;
  uniform float uHeight;
  uniform float uRadius;
  uniform float uSnowLine;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  ${NOISE_GLSL}

  // Narrow radial valleys; 1 in a gully, 0 on the ridges between them.
  float gully(float theta, float s) {
    vec2 p = vec2(theta * 24.0 + s * 3.0, s * 4.5);
    float n = vnoise(p) * 0.62 + vnoise(p * 2.13 + 7.3) * 0.38;
    return pow(1.0 - abs(n * 2.0 - 1.0), 5.0);
  }

  float snowMask(float h, float theta, float s) {
    float g = gully(theta, s);
    float reach = 0.35 + 0.65 * vnoise(vec2(theta * 7.0, 3.7));
    float ragged = vnoise(vec2(theta * 60.0, h * 22.0)) - 0.5;
    float line = uSnowLine - g * reach * 0.27 - ragged * 0.035;
    return smoothstep(line - 0.01, line + 0.01, h);
  }

  void main() {
    vec3 n = normalize(vNormalW);
    vec2 rel = vWorld.xz - uCenter.xz;
    float theta = atan(rel.x, rel.y);
    float s = length(rel) / uRadius;
    float h = clamp((vWorld.y - uCenter.y) / uHeight, 0.0, 1.0);

    float ndl = dot(n, uSunDir);
    float lit = smoothstep(-0.2, 0.7, ndl);
    float sky = 0.55 + 0.45 * n.y;
    float g = gully(theta, s);

    vec3 body = mix(uBodyLow, uBodyHigh, smoothstep(0.1, 0.8, h));
    body = mix(body, uBodyLit, lit * 0.45);
    body *= mix(0.84, 1.04, lit) * mix(0.9, 1.0, sky) * (1.0 - g * 0.07);

    vec3 snowLit = mix(uSnow, uAlpen, 0.42 * lit);
    vec3 snowCol = mix(uSnowShade * mix(0.93, 1.0, sky), snowLit, lit);
    vec3 col = mix(body, snowCol, snowMask(h, theta, s));

    float dist = length(vWorld - cameraPosition);
    float haze = 1.0 - exp(-dist * 0.00042);
    float low = 1.0 - smoothstep(0.0, 0.55, h);
    col = mix(col, uHaze, clamp(haze * 0.3 + low * low * 0.85, 0.0, 0.94));

    gl_FragColor = vec4(col, 1.0);
    ${OUTPUT_GLSL}
  }
`

export function createFujiMaterial(shape: FujiShape): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uBodyLow: { value: color(HEX.fujiLow) },
      uBodyHigh: { value: color(HEX.fujiHigh) },
      uBodyLit: { value: color('#C3A6CF') },
      uSnow: { value: color(HEX.snow) },
      uSnowShade: { value: color('#CFCBEA') },
      uAlpen: { value: color('#FFD3DC') },
      uHaze: { value: color('#F9D9CF') },
      uCenter: { value: new Vector3(shape.x, shape.baseY, shape.z) },
      uHeight: { value: shape.height },
      uRadius: { value: shape.radius },
      uSnowLine: { value: SNOW_LINE },
    },
    vertexShader,
    fragmentShader,
  })
}

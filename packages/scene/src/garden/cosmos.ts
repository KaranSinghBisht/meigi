import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, ShaderMaterial, type Texture } from 'three'
import { OUTPUT_GLSL } from '../shared/glsl'
import { GLOW_DIR, SUN_COLOR, SUN_DIR, color } from '../shared/palette'

// Cosmos (コスモス) in drifts: a slightly cupped head, painted petals and a
// thin stem, each head tilted and turned its own way and swaying on its own
// phase. The nearest heads go soft (a blurrier mip, a touch of fade), like a
// shallow depth of field.

const vertexShader = /* glsl */ `
  attribute vec4 aFlower; // x, z, height, head radius
  attribute vec2 aLook;   // tint, seed
  attribute float aPart;  // 0 stem, 1 head
  uniform float uTime;
  varying vec2 vUv;
  varying float vPart;
  varying float vTint;
  varying float vSoft;
  varying vec3 vNormal;
  varying vec3 vView;

  vec2 turn(vec2 p, float a) {
    float c = cos(a);
    float s = sin(a);
    return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  void main() {
    vUv = position.xy + 0.5;
    vPart = aPart;
    vTint = aLook.x;
    float phase = aLook.y * 6.2831;
    vec3 root = vec3(aFlower.x, 0.0, aFlower.y);
    vec3 toCam = cameraPosition - root;
    vSoft = smoothstep(8.5, 3.5, length(toCam));
    toCam.y = 0.0;
    toCam = normalize(toCam);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 sway = right * (sin(uTime * 1.2 + phase) * 0.03 + sin(uTime * 2.7 + phase * 1.9) * 0.01) + toCam * sin(uTime * 0.8 + phase * 1.3) * 0.012;
    vec3 world;
    if (aPart < 0.5) {
      float up = position.y + 0.5;
      world = root + right * position.x * 0.0035 + vec3(0.0, up * aFlower.z, 0.0) + sway * up * up;
      vNormal = toCam;
    } else {
      vec3 tilt = vec3(sin(phase * 3.1), 0.0, cos(phase * 2.3)) * 0.4;
      vec3 n = normalize(vec3(0.0, 0.8, 0.0) + toCam * 0.55 + tilt);
      vec3 hx = normalize(cross(vec3(0.0, 1.0, 0.0), n) + right * 0.001);
      vec3 hy = cross(n, hx);
      vec2 p = turn(position.xy, phase * 5.0);
      float cup = dot(position.xy, position.xy) * 0.8;
      vec3 top = root + vec3(0.0, aFlower.z, 0.0) + sway;
      world = top + (hx * p.x + hy * p.y) * aFlower.w * 2.0 + n * cup * aFlower.w;
      vNormal = n;
    }
    vView = cameraPosition - world;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uPetals;
  uniform vec3 uWhite;
  uniform vec3 uBlush;
  uniform vec3 uPink;
  uniform vec3 uMagenta;
  uniform vec3 uGold;
  uniform vec3 uStem;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uGlowDir;
  uniform vec3 uRim;
  varying vec2 vUv;
  varying float vPart;
  varying float vTint;
  varying float vSoft;
  varying vec3 vNormal;
  varying vec3 vView;

  void main() {
    if (vPart < 0.5) {
      gl_FragColor = vec4(uStem * (0.8 + 0.2 * vUv.y), 1.0 - 0.4 * vSoft);
      ${OUTPUT_GLSL}
      return;
    }
    vec4 paint = texture2D(uPetals, vUv, vSoft * 2.6);
    if (paint.a < 0.02) discard;
    // White, blush, pink or magenta: deeper at the petal's base, paler towards the tip.
    vec3 deep = mix(mix(uBlush, uPink, smoothstep(0.3, 0.6, vTint)), uMagenta, smoothstep(0.72, 0.95, vTint));
    vec3 pale = mix(uWhite, mix(uWhite, uPink, 0.45), smoothstep(0.55, 1.0, vTint));
    vec3 petal = mix(deep, pale, smoothstep(0.15, 0.85, paint.r)) * (0.9 + 0.16 * paint.b);
    vec3 col = mix(petal, uGold * (0.8 + 0.3 * paint.g), smoothstep(0.35, 0.75, paint.g));
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vView);
    float lambert = 0.62 + 0.38 * clamp(dot(n, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
    float through = pow(max(dot(-v, uGlowDir), 0.0), 2.0) * 0.35;
    float rim = pow(1.0 - abs(dot(n, v)), 2.0) * 0.3;
    col = col * (lambert * uSunColor * 0.95 + through) + uRim * rim;
    gl_FragColor = vec4(col, paint.a * (1.0 - 0.35 * vSoft));
    ${OUTPUT_GLSL}
  }
`

export function createCosmosMaterial(petals: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPetals: { value: petals },
      uWhite: { value: color('#FFF6F8') },
      uBlush: { value: color('#F4C6D6') },
      uPink: { value: color('#EA8FB4') },
      uMagenta: { value: color('#C8508E') },
      uGold: { value: color('#F2C14E') },
      uStem: { value: color('#7C9670') },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: SUN_COLOR.clone() },
      uGlowDir: { value: GLOW_DIR.clone() },
      uRim: { value: color('#FFE1D2') },
    },
    vertexShader,
    fragmentShader,
    alphaToCoverage: true,
  })
}

/** A stem quad and a 3 × 3 head grid (for the cup), shared by every flower. */
function flowerShape(): { positions: number[]; parts: number[]; index: number[] } {
  const positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]
  const parts = [0, 0, 0, 0]
  const index = [0, 1, 2, 0, 2, 3]
  const n = 4
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions.push(i / (n - 1) - 0.5, j / (n - 1) - 0.5, 0)
      parts.push(1)
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = 4 + j * n + i
      index.push(a, a + 1, a + n + 1, a, a + n + 1, a + n)
    }
  }
  return { positions, parts, index }
}

export function createCosmosGeometry(flowers: Float32Array, looks: Float32Array): BufferGeometry {
  const shape = flowerShape()
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(shape.positions, 3))
  geometry.setAttribute('aPart', new Float32BufferAttribute(shape.parts, 1))
  geometry.setIndex(shape.index)
  geometry.setAttribute('aFlower', new InstancedBufferAttribute(flowers, 4))
  geometry.setAttribute('aLook', new InstancedBufferAttribute(looks, 2))
  geometry.instanceCount = Math.floor(looks.length / 2)
  return geometry
}

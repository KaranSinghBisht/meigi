import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, ShaderMaterial, type Texture } from 'three'
import { OUTPUT_GLSL } from '../shared/glsl'
import { SUN_COLOR, SUN_DIR, color } from '../shared/palette'

// Cosmos (コスモス) heads floating over the bedding: painted billboards,
// each tipped a little off the camera and turned its own way, swaying on its
// own phase. Most show no stem; the front edge shows a short one. The same
// shader draws the out-of-focus nearest row from the pre-blurred texture.

const vertexShader = /* glsl */ `
  attribute vec4 aFlower; // x, z, height, head radius
  attribute vec3 aLook;   // tint, seed, visible stem length
  attribute float aPart;  // 0 stem, 1 head
  uniform float uTime;
  varying vec2 vUv;
  varying float vPart;
  varying float vTint;
  varying float vFacing;

  vec2 turn(vec2 p, float a) {
    return vec2(cos(a) * p.x - sin(a) * p.y, sin(a) * p.x + cos(a) * p.y);
  }

  void main() {
    vUv = position.xy + 0.5;
    vPart = aPart;
    vTint = aLook.x;
    float phase = aLook.y * 6.2831;
    vec3 top = vec3(aFlower.x, aFlower.z, aFlower.y);
    vec3 toCam = normalize(cameraPosition - top);
    vec3 level = normalize(vec3(toCam.x, 0.0, toCam.z));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), level));
    vec3 sway = right * (sin(uTime * 1.2 + phase) * 0.022 + sin(uTime * 2.6 + phase * 1.9) * 0.008);
    vec3 world;
    if (aPart < 0.5) {
      float up = position.y + 0.5;
      world = top + sway * up + right * position.x * 0.003 - vec3(0.0, (1.0 - up) * aLook.z, 0.0);
      vFacing = 1.0;
    } else {
      // Tipped off the camera a little: heads look up and about, not all straight at us.
      vec3 tilt = vec3(sin(phase * 3.1), 0.55 + 0.25 * sin(phase * 1.7), cos(phase * 2.3)) * 0.42;
      vec3 n = normalize(toCam + tilt);
      vec3 hx = normalize(cross(vec3(0.0, 1.0, 0.0), n));
      vec3 hy = cross(n, hx);
      vec2 p = turn(position.xy, phase * 5.0);
      world = top + sway + (hx * p.x + hy * p.y) * aFlower.w * 2.0;
      vFacing = dot(n, toCam);
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uPaint;
  uniform float uBokeh;
  uniform vec3 uStem;
  uniform vec3 uGold;
  uniform vec3 uWarm;
  uniform vec3 uRim;
  varying vec2 vUv;
  varying float vPart;
  varying float vTint;
  varying float vFacing;

  uniform vec3 uBase[5];
  uniform vec3 uTip[5];

  // White, blush, rose, magenta and a few deep crimson; each deeper at the base.
  vec3 petal(float t, float along) {
    vec3 base = uBase[0];
    vec3 tip = uTip[0];
    float w = smoothstep(0.3, 0.38, t);
    base = mix(base, uBase[1], w);
    tip = mix(tip, uTip[1], w);
    w = smoothstep(0.51, 0.59, t);
    base = mix(base, uBase[2], w);
    tip = mix(tip, uTip[2], w);
    w = smoothstep(0.76, 0.84, t);
    base = mix(base, uBase[3], w);
    tip = mix(tip, uTip[3], w);
    w = smoothstep(0.955, 0.975, t);
    base = mix(base, uBase[4], w);
    tip = mix(tip, uTip[4], w);
    return mix(base, tip, smoothstep(0.27, 0.95, along));
  }

  void main() {
    if (vPart < 0.5) {
      gl_FragColor = vec4(uStem, 1.0);
      ${OUTPUT_GLSL}
      return;
    }
    vec4 paint = texture2D(uPaint, vUv);
    if (paint.a < 0.03) discard;
    vec3 col = mix(petal(vTint, paint.r) * (0.8 + 0.2 * paint.r), uGold * (0.55 + 0.6 * paint.g), smoothstep(0.35, 0.7, paint.g));
    // Warm dawn grade, and light catching the petal edges.
    float edge = (1.0 - smoothstep(0.35, 0.95, paint.a)) * (1.0 - paint.g);
    col = col * uWarm * (0.86 + 0.14 * vFacing) + uRim * edge * 0.45;
    float alpha = paint.a * (1.0 - 0.3 * uBokeh);
    gl_FragColor = vec4(col, alpha);
    ${OUTPUT_GLSL}
  }
`

export function createCosmosMaterial(paint: Texture, bokeh: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPaint: { value: paint },
      uBokeh: { value: bokeh ? 1 : 0 },
      uBase: { value: ['#F3DDE5', '#EBB4C7', '#DB7FA3', '#C04C8C', '#9E2C4A'].map(color) },
      uTip: { value: ['#FFF9FA', '#FBE0E8', '#F5BFD2', '#E992BE', '#CE5670'].map(color) },
      uStem: { value: color('#6F8866') },
      uGold: { value: color('#F2C14E') },
      uWarm: { value: SUN_COLOR.clone().lerp(color('#FFFFFF'), 0.35).multiplyScalar(1.02 + Math.max(SUN_DIR.y, 0) * 0.1) },
      uRim: { value: color('#FFD9C4') },
    },
    vertexShader,
    fragmentShader,
    // The sharp heads rely on alpha to coverage; the bokeh row is truly blended over everything.
    alphaToCoverage: !bokeh,
    transparent: bokeh,
    depthWrite: !bokeh,
  })
}

/** A head quad, plus a stem quad unless `stems` is off (phones show none), shared by every flower. */
export function createCosmosGeometry(flowers: Float32Array, looks: Float32Array, stems: boolean): BufferGeometry {
  const quad = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]
  const geometry = new InstancedBufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(stems ? [...quad, ...quad] : quad, 3))
  geometry.setAttribute('aPart', new Float32BufferAttribute(stems ? [0, 0, 0, 0, 1, 1, 1, 1] : [1, 1, 1, 1], 1))
  geometry.setIndex(stems ? [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7] : [0, 1, 2, 0, 2, 3])
  geometry.setAttribute('aFlower', new InstancedBufferAttribute(flowers, 4))
  geometry.setAttribute('aLook', new InstancedBufferAttribute(looks, 3))
  geometry.instanceCount = Math.floor(looks.length / 3)
  return geometry
}
